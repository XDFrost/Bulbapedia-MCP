import { randomToken, sha256Hex } from "./crypto.ts";

export const TOKEN_PREFIX = "bp_";

export interface GeneratedToken {
	/** Plaintext token, shown to the user exactly once. */
	token: string;
	/** sha256 hex of the plaintext; the only thing stored. */
	hash: string;
	/** First 10 characters, safe to display in lists. */
	prefix: string;
}

export async function generateApiToken(): Promise<GeneratedToken> {
	const token = TOKEN_PREFIX + randomToken(32);
	return { token, hash: await sha256Hex(token), prefix: token.slice(0, 10) };
}

export function looksLikeApiToken(s: string): boolean {
	return s.startsWith(TOKEN_PREFIX) && s.length > 20;
}

/** Extract a bearer token from an Authorization header, or null. */
export function bearerFrom(header: string | null): string | null {
	if (!header) return null;
	const m = /^Bearer\s+(.+)$/i.exec(header.trim());
	return m ? m[1].trim() : null;
}

/** Allowed lifetimes for a token, in seconds. `null` means the token never expires. */
export const TTL_MIN_SECONDS = 5 * 60;
export const TTL_MAX_SECONDS = 365 * 24 * 3600;

/**
 * Validate a requested TTL. Accepts a number of seconds, a string like "7d" / "12h" / "30m", or null/"never".
 * Returns seconds, null for "never", or undefined when the input is invalid.
 */
export function ttlToSeconds(input: unknown): number | null | undefined {
	if (input === null || input === undefined || input === "" || input === "never") return null;
	let seconds: number;
	if (typeof input === "number") seconds = input;
	else if (typeof input === "string") {
		const m = /^(\d+)\s*([smhdw]?)$/i.exec(input.trim());
		if (!m) return undefined;
		const mult: Record<string, number> = { "": 1, s: 1, m: 60, h: 3600, d: 86400, w: 7 * 86400 };
		seconds = Number.parseInt(m[1], 10) * mult[m[2].toLowerCase()];
	} else return undefined;
	if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) return undefined;
	if (seconds < TTL_MIN_SECONDS || seconds > TTL_MAX_SECONDS) return undefined;
	return seconds;
}
