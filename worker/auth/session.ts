import type { AppEnv } from "../env.ts";
import { scopedSql } from "../db/client.ts";
import { createSession, getSessionUser, revokeSession, type User } from "../db/queries.ts";
import { randomToken, sha256Hex } from "./crypto.ts";

export const SESSION_COOKIE = "bp_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;
const CACHE_TTL_MS = 60_000;

const sessionCache = new Map<string, { user: User | null; at: number }>();

export function parseCookies(header: string | null): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(";")) {
		const i = part.indexOf("=");
		if (i === -1) continue;
		out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
	}
	return out;
}

export function isSecureOrigin(request: Request): boolean {
	return new URL(request.url).protocol === "https:";
}

export function cookieHeader(name: string, value: string, opts: { maxAge: number; secure: boolean; sameSite?: "Lax" | "Strict" }): string {
	const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", `SameSite=${opts.sameSite ?? "Lax"}`, `Max-Age=${opts.maxAge}`];
	if (opts.secure) parts.push("Secure");
	return parts.join("; ");
}

export function clearCookieHeader(name: string, secure: boolean): string {
	return cookieHeader(name, "", { maxAge: 0, secure });
}

/** Create a DB session for the user and return the Set-Cookie header value. */
export async function startSession(request: Request, user: User): Promise<string> {
	const value = randomToken(32);
	await createSession(scopedSql(), user.id, await sha256Hex(value), request.headers.get("User-Agent"), SESSION_TTL_SECONDS);
	return cookieHeader(SESSION_COOKIE, value, { maxAge: SESSION_TTL_SECONDS, secure: isSecureOrigin(request) });
}

/** Resolve the signed-in user from the session cookie, with a short in-isolate cache. */
export async function sessionUser(env: AppEnv, request: Request): Promise<User | null> {
	const value = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
	if (!value || !env.DB) return null;
	const hash = await sha256Hex(value);
	const cached = sessionCache.get(hash);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.user;
	const user = await getSessionUser(scopedSql(), hash);
	sessionCache.set(hash, { user, at: Date.now() });
	return user;
}

export async function endSession(env: AppEnv, request: Request): Promise<string> {
	const value = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
	if (value && env.DB) {
		const hash = await sha256Hex(value);
		sessionCache.delete(hash);
		await revokeSession(scopedSql(), hash);
	}
	return clearCookieHeader(SESSION_COOKIE, isSecureOrigin(request));
}

/** Drop a cached session (e.g. after an admin flag changes). */
export function forgetCachedSessions(): void {
	sessionCache.clear();
}
