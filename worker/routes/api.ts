import { Hono, type Context, type Next } from "hono";
import type { AppEnv } from "../env.ts";
import { sessionUser } from "../auth/session.ts";
import { generateApiToken, ttlToSeconds } from "../auth/api-token.ts";
import { forgetAllTokens } from "../auth.ts";
import { scopedSql } from "../db/client.ts";
import {
	adminListUsers, adminSummary, getUserById, insertApiToken, listApiTokens, listUsageEvents, purgeExpiredTokens, revokeApiToken, setUserAdmin, usageSummary, type User,
} from "../db/queries.ts";
import { forgetCachedSessions } from "../auth/session.ts";

type Vars = { user: User };
type Env = { Bindings: AppEnv; Variables: Vars };

function publicUser(u: User) {
	return { id: u.id, email: u.email, name: u.name, avatar_url: u.avatar_url, is_admin: u.is_admin, created_at: u.created_at, last_login_at: u.last_login_at };
}

function clampInt(v: string | undefined, def: number, min: number, max: number): number {
	const n = Number.parseInt(v ?? "", 10);
	if (Number.isNaN(n)) return def;
	return Math.min(max, Math.max(min, n));
}

async function requireUser(c: Context<Env>, next: Next) {
	if (!c.env.DB) return c.json({ error: "Database is not configured" }, 503);
	// CSRF guard on top of SameSite=Lax cookies: mutations must carry a custom header (not settable cross-site by forms).
	if (c.req.method !== "GET" && c.req.header("X-Requested-With") !== "fetch") return c.json({ error: "missing X-Requested-With header" }, 403);
	const user = await sessionUser(c.env, c.req.raw);
	if (!user) return c.json({ error: "unauthenticated" }, 401);
	c.set("user", user);
	await next();
}

async function requireAdmin(c: Context<Env>, next: Next) {
	if (!c.get("user").is_admin) return c.json({ error: "forbidden" }, 403);
	await next();
}

export const apiRoutes = new Hono<Env>();

/** Who am I? Answers 200 with a null user when signed out so the SPA's probe never logs a 401. */
apiRoutes.get("/me", async (c) => {
	if (!c.env.DB) return c.json({ user: null, is_admin: false, database: false });
	const user = await sessionUser(c.env, c.req.raw);
	return c.json({ user: user ? publicUser(user) : null, is_admin: user?.is_admin ?? false });
});

apiRoutes.use("*", requireUser);

apiRoutes.get("/tokens", async (c) => {
	// Expired tokens are removed the moment their owner looks at the list.
	const purged = await purgeExpiredTokens(scopedSql(), c.get("user").id);
	if (purged) forgetAllTokens();
	return c.json({ tokens: await listApiTokens(scopedSql(), c.get("user").id) });
});

apiRoutes.post("/tokens", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { name?: string; ttl?: unknown; ttl_seconds?: unknown };
	const name = (body.name ?? "").trim().slice(0, 80);
	if (!name) return c.json({ error: "name is required" }, 400);
	const ttl = ttlToSeconds(body.ttl_seconds ?? body.ttl);
	if (ttl === undefined) return c.json({ error: "ttl must be between 5 minutes and 365 days (seconds, or e.g. '7d', '12h'), or 'never'" }, 400);
	await purgeExpiredTokens(scopedSql(), c.get("user").id);
	const existing = await listApiTokens(scopedSql(), c.get("user").id);
	if (existing.filter((t) => !t.revoked_at).length >= 20) return c.json({ error: "token limit reached (20 active)" }, 400);
	const gen = await generateApiToken();
	const row = await insertApiToken(scopedSql(), { user_id: c.get("user").id, name, token_hash: gen.hash, token_prefix: gen.prefix, ttl_seconds: ttl });
	return c.json({ token: gen.token, record: row }, 201);
});

apiRoutes.delete("/tokens/:id", async (c) => {
	const ok = await revokeApiToken(scopedSql(), c.req.param("id"), c.get("user").id);
	forgetAllTokens();
	return ok ? c.json({ revoked: true }) : c.json({ error: "token not found" }, 404);
});

apiRoutes.get("/usage/summary", async (c) => {
	const days = clampInt(c.req.query("days"), 30, 1, 365);
	return c.json({ days, ...(await usageSummary(scopedSql(), c.get("user").id, days)) });
});

apiRoutes.get("/usage/events", async (c) => {
	const limit = clampInt(c.req.query("limit"), 50, 1, 200);
	const offset = clampInt(c.req.query("offset"), 0, 0, 1_000_000);
	const r = await listUsageEvents(scopedSql(), { user_id: c.get("user").id, token_id: c.req.query("token_id") ?? null, tool: c.req.query("tool") ?? null, limit, offset });
	return c.json({ ...r, limit, offset });
});

// ---- admin --------------------------------------------------------------------------------

const admin = new Hono<Env>();
admin.use("*", requireAdmin);

admin.get("/summary", async (c) => {
	const days = clampInt(c.req.query("days"), 30, 1, 365);
	const [summary, usage] = await Promise.all([adminSummary(scopedSql(), days), usageSummary(scopedSql(), null, days)]);
	return c.json({ days, ...summary, by_tool: usage.by_tool, by_day: usage.by_day });
});

admin.get("/users", async (c) => {
	const purged = await purgeExpiredTokens(scopedSql());
	if (purged) forgetAllTokens();
	return c.json({ users: await adminListUsers(scopedSql()) });
});

admin.get("/users/:id", async (c) => {
	const id = c.req.param("id");
	const user = await getUserById(scopedSql(), id);
	if (!user) return c.json({ error: "user not found" }, 404);
	const days = clampInt(c.req.query("days"), 30, 1, 365);
	const [tokens, usage] = await Promise.all([listApiTokens(scopedSql(), id), usageSummary(scopedSql(), id, days)]);
	return c.json({ user: publicUser(user), tokens, days, usage });
});

admin.get("/events", async (c) => {
	const limit = clampInt(c.req.query("limit"), 50, 1, 200);
	const offset = clampInt(c.req.query("offset"), 0, 0, 1_000_000);
	const r = await listUsageEvents(scopedSql(), { user_id: c.req.query("user_id") ?? null, token_id: c.req.query("token_id") ?? null, tool: c.req.query("tool") ?? null, limit, offset });
	return c.json({ ...r, limit, offset });
});

admin.post("/tokens/:id/revoke", async (c) => {
	const ok = await revokeApiToken(scopedSql(), c.req.param("id"), null);
	forgetAllTokens();
	return ok ? c.json({ revoked: true }) : c.json({ error: "token not found or already revoked" }, 404);
});

admin.post("/users/:id", async (c) => {
	const id = c.req.param("id");
	const body = (await c.req.json().catch(() => ({}))) as { is_admin?: boolean };
	if (typeof body.is_admin !== "boolean") return c.json({ error: "is_admin boolean is required" }, 400);
	if (id === c.get("user").id && !body.is_admin) return c.json({ error: "you cannot remove your own admin access" }, 400);
	const user = await setUserAdmin(scopedSql(), id, body.is_admin);
	forgetCachedSessions();
	return user ? c.json({ user: publicUser(user) }) : c.json({ error: "user not found" }, 404);
});

apiRoutes.route("/admin", admin);
