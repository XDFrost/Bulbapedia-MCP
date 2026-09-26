import { AsyncLocalStorage } from "node:async_hooks";
import type postgres from "postgres";

/** Identity of the caller on /mcp, resolved by the auth gate. Legacy shared-token callers have null ids. */
export interface CallerIdentity {
	user_id: string | null;
	token_id: string | null;
	token_name: string | null;
	email: string | null;
}

/** The only part of the execution context the scope needs; Hono's and Cloudflare's context types both satisfy it. */
export interface WaitUntil {
	waitUntil(promise: Promise<unknown>): void;
}

/** Per-request scope: Worker execution context (for waitUntil), the caller, and a lazily created DB client. */
export interface RequestScope {
	ctx?: WaitUntil;
	caller?: CallerIdentity;
	dbConnectionString?: string;
	sql?: ReturnType<typeof postgres>;
}

export const requestScope = new AsyncLocalStorage<RequestScope>();
