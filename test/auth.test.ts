import { describe, expect, it } from "vitest";
import { bearerFrom, generateApiToken, looksLikeApiToken } from "../worker/auth/api-token.ts";
import { randomToken, sha256Hex, signPayload, timingSafeEqual, verifyPayload } from "../worker/auth/crypto.ts";
import { buildAuthUrl, exchangeCode, identityFromPayload, newOAuthState } from "../worker/auth/google.ts";
import { cookieHeader, parseCookies } from "../worker/auth/session.ts";

describe("api tokens", () => {
	it("generates bp_ tokens with a sha256 hash and 10-char prefix", async () => {
		const t = await generateApiToken();
		expect(t.token.startsWith("bp_")).toBe(true);
		expect(t.token.length).toBeGreaterThan(40);
		expect(t.prefix).toBe(t.token.slice(0, 10));
		expect(t.hash).toBe(await sha256Hex(t.token));
		expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
		const t2 = await generateApiToken();
		expect(t2.token).not.toBe(t.token);
	});
	it("recognises token shapes and bearer headers", () => {
		expect(looksLikeApiToken("bp_abcdefghijklmnopqrstuvwxyz")).toBe(true);
		expect(looksLikeApiToken("local-dev-token")).toBe(false);
		expect(bearerFrom("Bearer abc")).toBe("abc");
		expect(bearerFrom("bearer   abc ")).toBe("abc");
		expect(bearerFrom("Basic abc")).toBeNull();
		expect(bearerFrom(null)).toBeNull();
	});
});

describe("crypto", () => {
	it("signs and verifies payloads, rejecting tampering", async () => {
		const token = await signPayload("secret", { a: 1, next: "/dashboard" });
		expect(await verifyPayload("secret", token)).toEqual({ a: 1, next: "/dashboard" });
		expect(await verifyPayload("other", token)).toBeNull();
		expect(await verifyPayload("secret", `${token}x`)).toBeNull();
		expect(await verifyPayload("secret", "garbage")).toBeNull();
	});
	it("timingSafeEqual and randomness", () => {
		expect(timingSafeEqual("abc", "abc")).toBe(true);
		expect(timingSafeEqual("abc", "abd")).toBe(false);
		expect(timingSafeEqual("abc", "abcd")).toBe(false);
		expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});
});

describe("cookies", () => {
	it("round-trips cookie headers", () => {
		const h = cookieHeader("bp_session", "v a", { maxAge: 10, secure: true });
		expect(h).toContain("bp_session=v%20a");
		expect(h).toContain("HttpOnly");
		expect(h).toContain("Secure");
		expect(h).toContain("SameSite=Lax");
		expect(parseCookies("a=1; bp_session=v%20a; c=3")).toEqual({ a: "1", bp_session: "v a", c: "3" });
		expect(parseCookies(null)).toEqual({});
	});
});

describe("google oauth", () => {
	it("builds an authorization url with PKCE", async () => {
		const st = await newOAuthState("/dashboard");
		const url = new URL(await buildAuthUrl("client-id", "http://localhost:8788/auth/callback", st));
		expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
		expect(url.searchParams.get("client_id")).toBe("client-id");
		expect(url.searchParams.get("state")).toBe(st.state);
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("scope")).toBe("openid email profile");
		expect(st.exp).toBeGreaterThan(Date.now());
	});
	it("maps a verified id_token payload to an identity and rejects unverified emails", () => {
		expect(identityFromPayload({ sub: "123", email: "Someone@Example.com", email_verified: true, name: "Some One", picture: "p" })).toEqual({
			sub: "123",
			email: "someone@example.com",
			email_verified: true,
			name: "Some One",
			picture: "p",
		});
		expect(() => identityFromPayload({ sub: "123", email: "x@y.z", email_verified: false })).toThrow(/not verified/);
		expect(() => identityFromPayload({ sub: "123" })).toThrow(/missing/);
	});
	it("exchanges a code using injected fetch and verifier", async () => {
		const calls: { url: string; body: string }[] = [];
		const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
			calls.push({ url: String(url), body: String(init?.body) });
			return new Response(JSON.stringify({ id_token: "signed.jwt.here" }), { status: 200 });
		}) as unknown as typeof fetch;
		const identity = await exchangeCode(
			{ clientId: "cid", clientSecret: "sec", redirectUri: "http://localhost/auth/callback", code: "the-code", codeVerifier: "ver" },
			{ fetch: fakeFetch, verify: async (idToken, clientId) => ({ sub: "9", email: "a@b.c", email_verified: true, aud: clientId, name: idToken }) },
		);
		expect(identity.sub).toBe("9");
		expect(identity.name).toBe("signed.jwt.here");
		expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
		expect(calls[0].body).toContain("code=the-code");
		expect(calls[0].body).toContain("code_verifier=ver");
		expect(calls[0].body).toContain("grant_type=authorization_code");
	});
	it("fails loudly when Google rejects the code", async () => {
		const fakeFetch = (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch;
		await expect(exchangeCode({ clientId: "c", clientSecret: "s", redirectUri: "r", code: "x", codeVerifier: "v" }, { fetch: fakeFetch })).rejects.toThrow(/HTTP 400/);
	});
});

describe("token ttl", async () => {
	const { ttlToSeconds, TTL_MAX_SECONDS, TTL_MIN_SECONDS } = await import("../worker/auth/api-token.ts");
	it("accepts seconds, duration strings and never", () => {
		expect(ttlToSeconds(3600)).toBe(3600);
		expect(ttlToSeconds("7d")).toBe(7 * 86400);
		expect(ttlToSeconds("12h")).toBe(12 * 3600);
		expect(ttlToSeconds("30m")).toBe(1800);
		expect(ttlToSeconds("2w")).toBe(14 * 86400);
		expect(ttlToSeconds("never")).toBeNull();
		expect(ttlToSeconds(null)).toBeNull();
		expect(ttlToSeconds(undefined)).toBeNull();
		expect(ttlToSeconds("")).toBeNull();
	});
	it("rejects out-of-range and malformed values", () => {
		expect(ttlToSeconds(TTL_MIN_SECONDS - 1)).toBeUndefined();
		expect(ttlToSeconds(TTL_MAX_SECONDS + 1)).toBeUndefined();
		expect(ttlToSeconds("2y")).toBeUndefined();
		expect(ttlToSeconds("abc")).toBeUndefined();
		expect(ttlToSeconds(3600.5)).toBeUndefined();
		expect(ttlToSeconds({})).toBeUndefined();
	});
});
