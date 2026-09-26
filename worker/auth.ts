/** Bearer-token gate for /mcp: per-user API tokens from the DB, or the optional legacy shared token. */
import type { AppEnv } from "./env.ts";
import type { CallerIdentity, WaitUntil } from "./scope.ts";
import { bearerFrom, looksLikeApiToken } from "./auth/api-token.ts";
import { sha256Hex, timingSafeEqual } from "./auth/crypto.ts";
import type { Sql } from "./db/client.ts";
import { deleteApiToken, resolveApiToken, touchApiToken } from "./db/queries.ts";

const CACHE_TTL_MS = 60_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;
interface CacheEntry {
	caller: CallerIdentity | null;
	/** Unix ms when the token expires, or null for never. */
	expiresAt: number | null;
	at: number;
}
const tokenCache = new Map<string, CacheEntry>();

export function unauthorized(message: string): Response {
	return new Response(JSON.stringify({ error: "unauthorized", message }), {
		status: 401,
		headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="bulbapedia-mcp"' },
	});
}

/**
 * Resolve the Authorization header to a caller identity.
 * `getSql` is only invoked when a DB lookup is actually needed.
 */
export async function authenticateBearer(
	env: AppEnv,
	ctx: WaitUntil | undefined,
	header: string | null,
	getSql: () => Sql,
): Promise<CallerIdentity | Response> {
	const token = bearerFrom(header);
	if (!token) return unauthorized("Send Authorization: Bearer <token>. Create a token on the dashboard.");

	if (looksLikeApiToken(token)) {
		if (!env.DB) return unauthorized("Per-user tokens require the database binding");
		const hash = await sha256Hex(token);
		const cached = tokenCache.get(hash);
		if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
			if (cached.expiresAt !== null && cached.expiresAt <= Date.now()) {
				tokenCache.delete(hash);
				return unauthorized("Token expired");
			}
			return cached.caller ?? unauthorized("Invalid or revoked token");
		}
		const sql = getSql();
		const resolved = await resolveApiToken(sql, hash);
		if (resolved?.expired) {
			// Lazy cleanup: an expired token that is presented gets deleted right away.
			tokenCache.delete(hash);
			const p = deleteApiToken(sql, resolved.token_id).catch(() => {});
			if (ctx) ctx.waitUntil(p);
			return unauthorized("Token expired");
		}
		const caller = resolved ? { user_id: resolved.user.id, token_id: resolved.token_id, token_name: resolved.token_name, email: resolved.user.email } : null;
		tokenCache.set(hash, { caller, expiresAt: resolved?.expires_at ? new Date(resolved.expires_at).getTime() : null, at: Date.now() });
		if (!resolved) return unauthorized("Invalid or revoked token");
		const lastUsed = resolved.last_used_at ? new Date(resolved.last_used_at).getTime() : 0;
		if (Date.now() - lastUsed > TOUCH_INTERVAL_MS) {
			const p = touchApiToken(sql, resolved.token_id).catch(() => {});
			if (ctx) ctx.waitUntil(p);
		}
		return caller!;
	}

	if (env.MCP_AUTH_TOKEN && timingSafeEqual(token, env.MCP_AUTH_TOKEN)) {
		return { user_id: null, token_id: null, token_name: null, email: null };
	}
	return unauthorized("Invalid token");
}

/** Forget a token's cached resolution (after revocation). */
export function forgetToken(hash: string): void {
	tokenCache.delete(hash);
}
export function forgetAllTokens(): void {
	tokenCache.clear();
}
