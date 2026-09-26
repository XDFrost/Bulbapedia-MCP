import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { buildAuthUrl, exchangeCode, newOAuthState, type OAuthState } from "../auth/google.ts";
import { signPayload, verifyPayload } from "../auth/crypto.ts";
import { clearCookieHeader, cookieHeader, endSession, isSecureOrigin, parseCookies, startSession } from "../auth/session.ts";
import { scopedSql } from "../db/client.ts";
import { upsertGoogleUser } from "../db/queries.ts";
import { forgetAllTokens } from "../auth.ts";

const STATE_COOKIE = "bp_oauth";

function safeNext(next: string | undefined): string {
	return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export const authRoutes = new Hono<{ Bindings: AppEnv }>();

authRoutes.get("/google", async (c) => {
	const env = c.env;
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET) {
		return c.json({ error: "Google login is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET)" }, 503);
	}
	if (!env.DB) return c.json({ error: "Database is not configured" }, 503);
	const origin = new URL(c.req.url).origin;
	const st = await newOAuthState(safeNext(c.req.query("next")));
	const url = await buildAuthUrl(env.GOOGLE_CLIENT_ID, `${origin}/auth/callback`, st);
	c.header("Set-Cookie", cookieHeader(STATE_COOKIE, await signPayload(env.SESSION_SECRET, st), { maxAge: 600, secure: isSecureOrigin(c.req.raw) }));
	return c.redirect(url, 302);
});

authRoutes.get("/callback", async (c) => {
	const env = c.env;
	const secure = isSecureOrigin(c.req.raw);
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET || !env.DB) return c.text("Login is not configured", 503);
	const cookie = parseCookies(c.req.header("Cookie") ?? null)[STATE_COOKIE];
	const st = cookie ? await verifyPayload<OAuthState>(env.SESSION_SECRET, cookie) : null;
	const code = c.req.query("code");
	const state = c.req.query("state");
	if (c.req.query("error")) return c.redirect(`/?login_error=${encodeURIComponent(c.req.query("error") ?? "denied")}`, 302);
	if (!st || !code || !state || st.state !== state || st.exp < Date.now()) {
		return c.text("Login state is missing or expired. Please try signing in again.", 400);
	}
	const origin = new URL(c.req.url).origin;
	let identity;
	try {
		identity = await exchangeCode({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${origin}/auth/callback`, code, codeVerifier: st.code_verifier });
	} catch (e) {
		console.error("google login failed:", (e as Error).message);
		return c.text("Google sign-in failed. Please try again.", 502);
	}
	const bootstrap = (env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
	const user = await upsertGoogleUser(scopedSql(), {
		google_sub: identity.sub,
		email: identity.email,
		name: identity.name,
		avatar_url: identity.picture,
		make_admin: !!bootstrap && bootstrap === identity.email,
	});
	const setSession = await startSession(c.req.raw, user);
	c.header("Set-Cookie", setSession, { append: true });
	c.header("Set-Cookie", clearCookieHeader(STATE_COOKIE, secure), { append: true });
	return c.redirect(st.next, 302);
});

authRoutes.post("/logout", async (c) => {
	const clear = await endSession(c.env, c.req.raw);
	c.header("Set-Cookie", clear);
	return c.body(null, 204);
});

/** Local-only (DEV_LOGIN_SECRET): force a token to be expired so tests can exercise TTL handling. */
authRoutes.get("/dev-expire-token", async (c) => {
	const secret = c.env.DEV_LOGIN_SECRET;
	if (!secret || !c.env.DB) return c.notFound();
	if (c.req.query("secret") !== secret) return c.text("bad secret", 403);
	const id = c.req.query("id") ?? "";
	const rows = await scopedSql()`update api_tokens set expires_at = now() - interval '1 second' where id = ${id} returning id`;
	// Real expiries are fixed at creation, so the auth cache's copy is always right; this backdoor moves it, so drop the cache.
	forgetAllTokens();
	return c.json({ expired: rows.length > 0 });
});

/** Local-only: create a session without Google. Enabled only when DEV_LOGIN_SECRET is set (never in production). */
authRoutes.get("/dev-login", async (c) => {
	const env = c.env;
	const secret = env.DEV_LOGIN_SECRET;
	if (!secret || !env.DB) return c.notFound();
	if (c.req.query("secret") !== secret) return c.text("bad secret", 403);
	const email = (c.req.query("email") ?? "dev@example.com").toLowerCase();
	const name = c.req.query("name") ?? email.split("@")[0];
	const admin = c.req.query("admin") === "1";
	const user = await upsertGoogleUser(scopedSql(), { google_sub: `dev:${email}`, email, name, avatar_url: null, make_admin: admin });
	c.header("Set-Cookie", await startSession(c.req.raw, user));
	if (c.req.query("json") === "1") return c.json({ user: { id: user.id, email: user.email, is_admin: user.is_admin } });
	return c.redirect(safeNext(c.req.query("next")), 302);
});
