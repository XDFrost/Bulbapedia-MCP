/** Small crypto helpers on top of WebCrypto (available in Workers and Node 20+). */

const enc = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomBytes(n: number): Uint8Array {
	const b = new Uint8Array(n);
	crypto.getRandomValues(b);
	return b;
}

/** URL-safe random string with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
	return base64url(randomBytes(bytes));
}

export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Base64url(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
	return base64url(new Uint8Array(digest));
}

export function timingSafeEqual(a: string, b: string): boolean {
	const ab = enc.encode(a);
	const bb = enc.encode(b);
	if (ab.byteLength !== bb.byteLength) return false;
	let diff = 0;
	for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
	return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Sign a JSON-serialisable payload: base64url(json).base64url(hmac). */
export async function signPayload(secret: string, payload: unknown): Promise<string> {
	const body = base64url(enc.encode(JSON.stringify(payload)));
	const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
	return `${body}.${base64url(sig)}`;
}

/** Verify and decode a payload produced by signPayload; returns null if tampered or malformed. */
export async function verifyPayload<T>(secret: string, token: string): Promise<T | null> {
	const dot = token.lastIndexOf(".");
	if (dot === -1) return null;
	const body = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body))));
	if (!timingSafeEqual(sig, expected)) return null;
	try {
		const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}
