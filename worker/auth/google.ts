/** Google OAuth 2.0 authorization-code flow with PKCE, owned by the Worker. */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { randomToken, sha256Base64url } from "./crypto.ts";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface OAuthState {
	state: string;
	code_verifier: string;
	/** Where to send the user after login. */
	next: string;
	/** Unix ms; the state cookie is only valid for 10 minutes. */
	exp: number;
}

export async function newOAuthState(next: string): Promise<OAuthState> {
	return { state: randomToken(16), code_verifier: randomToken(32), next, exp: Date.now() + 10 * 60_000 };
}

export async function buildAuthUrl(clientId: string, redirectUri: string, st: OAuthState): Promise<string> {
	const url = new URL(GOOGLE_AUTH_URL);
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", "openid email profile");
	url.searchParams.set("state", st.state);
	url.searchParams.set("code_challenge", await sha256Base64url(st.code_verifier));
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("prompt", "select_account");
	return url.toString();
}

export interface GoogleIdentity {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string | null;
	picture: string | null;
}

export interface GoogleDeps {
	fetch?: typeof fetch;
	/** Override for tests: verify the id_token and return its payload. */
	verify?: (idToken: string, clientId: string) => Promise<JWTPayload>;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function verifyIdToken(idToken: string, clientId: string): Promise<JWTPayload> {
	jwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
	const { payload } = await jwtVerify(idToken, jwks, { issuer: GOOGLE_ISSUERS, audience: clientId });
	return payload;
}

/** Exchange the authorization code for tokens and return the verified identity. */
export async function exchangeCode(
	opts: { clientId: string; clientSecret: string; redirectUri: string; code: string; codeVerifier: string },
	deps: GoogleDeps = {},
): Promise<GoogleIdentity> {
	const f = deps.fetch ?? fetch;
	const res = await f(GOOGLE_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code: opts.code,
			client_id: opts.clientId,
			client_secret: opts.clientSecret,
			redirect_uri: opts.redirectUri,
			grant_type: "authorization_code",
			code_verifier: opts.codeVerifier,
		}),
	});
	if (!res.ok) throw new Error(`Google token exchange failed: HTTP ${res.status}`);
	const data = (await res.json()) as { id_token?: string };
	if (!data.id_token) throw new Error("Google token response had no id_token");
	const payload = await (deps.verify ?? verifyIdToken)(data.id_token, opts.clientId);
	return identityFromPayload(payload);
}

export function identityFromPayload(payload: JWTPayload): GoogleIdentity {
	const p = payload as JWTPayload & { email?: string; email_verified?: boolean; name?: string; picture?: string };
	if (!p.sub || !p.email) throw new Error("Google id_token missing sub/email");
	if (p.email_verified !== true) throw new Error("Google account email is not verified");
	return { sub: p.sub, email: p.email.toLowerCase(), email_verified: true, name: p.name ?? null, picture: p.picture ?? null };
}
