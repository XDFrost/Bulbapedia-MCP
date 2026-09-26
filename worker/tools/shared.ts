import type { CallToolResult } from "@modelcontextprotocol/server";
import { BulbapediaError } from "../bulbapedia/client.ts";

/** Wrap a tool body so thrown errors become MCP `isError` results instead of protocol failures. */
export async function safe(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
	try {
		return await fn();
	} catch (e) {
		const msg = e instanceof BulbapediaError ? `${e.message} (${e.code})` : ((e as Error)?.message ?? String(e));
		return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
	}
}

/** Structured result: JSON text for legacy clients plus `structuredContent` for 2026-era clients. */
export function json(data: Record<string, unknown>): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

export function text(s: string): CallToolResult {
	return { content: [{ type: "text", text: s }] };
}

export function notFound(kind: string, name: string): CallToolResult {
	return { content: [{ type: "text", text: `No Bulbapedia ${kind} page found for "${name}". Try search_bulbapedia to find the exact title.` }], isError: true };
}

export function truncate(s: string, max: number): { text: string; truncated: boolean } {
	if (s.length <= max) return { text: s, truncated: false };
	return { text: `${s.slice(0, max)}\n\n[truncated: ${s.length - max} more characters]`, truncated: true };
}
