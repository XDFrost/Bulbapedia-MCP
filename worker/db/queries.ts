import type { Sql } from "./client.ts";

export interface User {
	id: string;
	google_sub: string;
	email: string;
	name: string | null;
	avatar_url: string | null;
	is_admin: boolean;
	created_at: string;
	last_login_at: string | null;
}

export interface ApiToken {
	id: string;
	user_id: string;
	name: string;
	token_prefix: string;
	created_at: string;
	last_used_at: string | null;
	revoked_at: string | null;
	/** null = never expires */
	expires_at: string | null;
}

export interface UsageEvent {
	id: number;
	user_id: string | null;
	token_id: string | null;
	/** Name of the token at the time of the call (kept even after the token row is deleted). */
	token_name: string | null;
	tool: string;
	args: unknown;
	ok: boolean;
	error: string | null;
	duration_ms: number | null;
	created_at: string;
}

// ---- users --------------------------------------------------------------------------------

export async function upsertGoogleUser(
	sql: Sql,
	u: { google_sub: string; email: string; name: string | null; avatar_url: string | null; make_admin: boolean },
): Promise<User> {
	const rows = await sql<User[]>`
		insert into users (google_sub, email, name, avatar_url, is_admin, last_login_at)
		values (${u.google_sub}, ${u.email}, ${u.name}, ${u.avatar_url}, ${u.make_admin}, now())
		on conflict (google_sub) do update set
			email = excluded.email,
			name = excluded.name,
			avatar_url = excluded.avatar_url,
			is_admin = users.is_admin or excluded.is_admin,
			last_login_at = now()
		returning *`;
	return rows[0];
}

export async function getUserById(sql: Sql, id: string): Promise<User | null> {
	const rows = await sql<User[]>`select * from users where id = ${id}`;
	return rows[0] ?? null;
}

export async function setUserAdmin(sql: Sql, id: string, isAdmin: boolean): Promise<User | null> {
	const rows = await sql<User[]>`update users set is_admin = ${isAdmin} where id = ${id} returning *`;
	return rows[0] ?? null;
}

// ---- sessions -----------------------------------------------------------------------------

export async function createSession(sql: Sql, userId: string, tokenHash: string, userAgent: string | null, ttlSeconds: number): Promise<void> {
	await sql`insert into sessions (user_id, token_hash, user_agent, expires_at)
		values (${userId}, ${tokenHash}, ${userAgent}, now() + make_interval(secs => ${ttlSeconds}))`;
}

export async function getSessionUser(sql: Sql, tokenHash: string): Promise<User | null> {
	const rows = await sql<User[]>`
		select u.* from sessions s join users u on u.id = s.user_id
		where s.token_hash = ${tokenHash} and s.revoked_at is null and s.expires_at > now()`;
	return rows[0] ?? null;
}

export async function revokeSession(sql: Sql, tokenHash: string): Promise<void> {
	await sql`update sessions set revoked_at = now() where token_hash = ${tokenHash} and revoked_at is null`;
}

// ---- api tokens ---------------------------------------------------------------------------

const TOKEN_COLUMNS = "id, user_id, name, token_prefix, created_at, last_used_at, revoked_at, expires_at";

export async function insertApiToken(
	sql: Sql,
	t: { user_id: string; name: string; token_hash: string; token_prefix: string; ttl_seconds: number | null },
): Promise<ApiToken> {
	const rows = await sql<ApiToken[]>`
		insert into api_tokens (user_id, name, token_hash, token_prefix, expires_at)
		values (${t.user_id}, ${t.name}, ${t.token_hash}, ${t.token_prefix}, ${t.ttl_seconds === null ? null : sql`now() + make_interval(secs => ${t.ttl_seconds})`})
		returning ${sql.unsafe(TOKEN_COLUMNS)}`;
	return rows[0];
}

export async function listApiTokens(sql: Sql, userId: string): Promise<ApiToken[]> {
	return sql<ApiToken[]>`
		select ${sql.unsafe(TOKEN_COLUMNS)}
		from api_tokens where user_id = ${userId} order by created_at desc`;
}

/** Delete expired tokens (for one user, or everyone when userId is null). Returns how many were removed. */
export async function purgeExpiredTokens(sql: Sql, userId: string | null = null): Promise<number> {
	const rows = userId
		? await sql`delete from api_tokens where user_id = ${userId} and expires_at is not null and expires_at <= now() returning id`
		: await sql`delete from api_tokens where expires_at is not null and expires_at <= now() returning id`;
	return rows.length;
}

/** Delete one token by id (used when an expired token is presented). */
export async function deleteApiToken(sql: Sql, tokenId: string): Promise<void> {
	await sql`delete from api_tokens where id = ${tokenId}`;
}

export async function revokeApiToken(sql: Sql, tokenId: string, userId: string | null): Promise<boolean> {
	const rows = userId
		? await sql`update api_tokens set revoked_at = now() where id = ${tokenId} and user_id = ${userId} and revoked_at is null returning id`
		: await sql`update api_tokens set revoked_at = now() where id = ${tokenId} and revoked_at is null returning id`;
	return rows.length > 0;
}

export interface ResolvedToken {
	token_id: string;
	token_name: string;
	last_used_at: string | null;
	/** null = never expires */
	expires_at: string | null;
	/** True when the row exists but has already passed its expiry (caller should delete it). */
	expired: boolean;
	user: User;
}

export async function resolveApiToken(sql: Sql, tokenHash: string): Promise<ResolvedToken | null> {
	const rows = await sql<(User & { token_id: string; token_name: string; token_last_used_at: string | null; token_expires_at: string | null; token_expired: boolean })[]>`
		select u.*, t.id as token_id, t.name as token_name, t.last_used_at as token_last_used_at, t.expires_at as token_expires_at,
			(t.expires_at is not null and t.expires_at <= now()) as token_expired
		from api_tokens t join users u on u.id = t.user_id
		where t.token_hash = ${tokenHash} and t.revoked_at is null`;
	const r = rows[0];
	if (!r) return null;
	const { token_id, token_name, token_last_used_at, token_expires_at, token_expired, ...user } = r;
	return { token_id, token_name, last_used_at: token_last_used_at, expires_at: token_expires_at, expired: token_expired, user };
}

export async function touchApiToken(sql: Sql, tokenId: string): Promise<void> {
	await sql`update api_tokens set last_used_at = now() where id = ${tokenId}`;
}

// ---- usage --------------------------------------------------------------------------------

export async function insertUsageEvent(
	sql: Sql,
	e: { user_id: string | null; token_id: string | null; token_name: string | null; tool: string; args: unknown; ok: boolean; error: string | null; duration_ms: number },
): Promise<void> {
	await sql`insert into usage_events (user_id, token_id, token_name, tool, args, ok, error, duration_ms)
		values (${e.user_id}, ${e.token_id}, ${e.token_name}, ${e.tool}, ${sql.json(e.args as never)}, ${e.ok}, ${e.error}, ${e.duration_ms})`;
}

export interface UsageSummary {
	total_calls: number;
	error_calls: number;
	by_tool: { tool: string; calls: number; errors: number; avg_ms: number | null }[];
	by_day: { day: string; calls: number; errors: number }[];
}

/** Usage summary for one user (userId) or everyone (null). */
export async function usageSummary(sql: Sql, userId: string | null, days: number): Promise<UsageSummary> {
	const scope = userId ? sql`and user_id = ${userId}` : sql``;
	const [totals] = await sql<{ total_calls: number; error_calls: number }[]>`
		select count(*)::int as total_calls, count(*) filter (where not ok)::int as error_calls
		from usage_events where created_at > now() - make_interval(days => ${days}) ${scope}`;
	const by_tool = await sql<UsageSummary["by_tool"]>`
		select tool, count(*)::int as calls, count(*) filter (where not ok)::int as errors, round(avg(duration_ms))::int as avg_ms
		from usage_events where created_at > now() - make_interval(days => ${days}) ${scope}
		group by tool order by calls desc`;
	const by_day = await sql<UsageSummary["by_day"]>`
		select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as calls, count(*) filter (where not ok)::int as errors
		from usage_events where created_at > now() - make_interval(days => ${days}) ${scope}
		group by 1 order by 1`;
	return { total_calls: totals?.total_calls ?? 0, error_calls: totals?.error_calls ?? 0, by_tool, by_day };
}

export interface EventFilter {
	user_id?: string | null;
	token_id?: string | null;
	tool?: string | null;
	limit: number;
	offset: number;
}

export type EventRow = UsageEvent & { user_email: string | null };

export async function listUsageEvents(sql: Sql, f: EventFilter): Promise<{ total: number; events: EventRow[] }> {
	const where = sql`where true
		${f.user_id ? sql`and e.user_id = ${f.user_id}` : sql``}
		${f.token_id ? sql`and e.token_id = ${f.token_id}` : sql``}
		${f.tool ? sql`and e.tool = ${f.tool}` : sql``}`;
	const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from usage_events e ${where}`;
	const events = await sql<EventRow[]>`
		select e.id, e.user_id, e.token_id, e.tool, e.args, e.ok, e.error, e.duration_ms, e.created_at,
			coalesce(t.name, e.token_name) as token_name, u.email as user_email
		from usage_events e left join users u on u.id = e.user_id left join api_tokens t on t.id = e.token_id
		${where} order by e.created_at desc limit ${f.limit} offset ${f.offset}`;
	return { total, events };
}

export interface AdminUserRow extends User {
	token_count: number;
	active_token_count: number;
	call_count: number;
	error_count: number;
	last_active_at: string | null;
}

export async function adminListUsers(sql: Sql): Promise<AdminUserRow[]> {
	return sql<AdminUserRow[]>`
		select u.*,
			(select count(*)::int from api_tokens t where t.user_id = u.id) as token_count,
			(select count(*)::int from api_tokens t where t.user_id = u.id and t.revoked_at is null and (t.expires_at is null or t.expires_at > now())) as active_token_count,
			(select count(*)::int from usage_events e where e.user_id = u.id) as call_count,
			(select count(*)::int from usage_events e where e.user_id = u.id and not e.ok) as error_count,
			(select max(e.created_at) from usage_events e where e.user_id = u.id) as last_active_at
		from users u order by u.created_at desc`;
}

export interface AdminSummary {
	users: number;
	calls_today: number;
	calls_period: number;
	errors_period: number;
	active_users_period: number;
}

export async function adminSummary(sql: Sql, days: number): Promise<AdminSummary> {
	const [r] = await sql<AdminSummary[]>`
		select
			(select count(*)::int from users) as users,
			(select count(*)::int from usage_events where created_at > date_trunc('day', now())) as calls_today,
			(select count(*)::int from usage_events where created_at > now() - make_interval(days => ${days})) as calls_period,
			(select count(*)::int from usage_events where created_at > now() - make_interval(days => ${days}) and not ok) as errors_period,
			(select count(distinct user_id)::int from usage_events where created_at > now() - make_interval(days => ${days}) and user_id is not null) as active_users_period`;
	return r;
}
