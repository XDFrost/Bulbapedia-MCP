/** Records one usage_events row per MCP tool call, attributed to the caller resolved by the auth gate. */
import type { McpServer } from "@modelcontextprotocol/server";
import { requestScope } from "./scope.ts";
import { scopedSql } from "./db/client.ts";
import { insertUsageEvent } from "./db/queries.ts";

interface ToolResultLike {
	isError?: boolean;
	content?: { type: string; text?: string }[];
}

function record(tool: string, args: unknown, result: ToolResultLike | null, thrown: unknown, startedAt: number): void {
	const scope = requestScope.getStore();
	if (!scope?.dbConnectionString) return;
	const ok = !thrown && !result?.isError;
	let error: string | null = null;
	if (thrown) error = String((thrown as Error)?.message ?? thrown).slice(0, 500);
	else if (result?.isError) error = (result.content?.find((c) => c.type === "text")?.text ?? "error").slice(0, 500);
	const p = insertUsageEvent(scopedSql(), {
		user_id: scope.caller?.user_id ?? null,
		token_id: scope.caller?.token_id ?? null,
		token_name: scope.caller?.token_name ?? null,
		tool,
		args: args ?? {},
		ok,
		error,
		duration_ms: Date.now() - startedAt,
	}).catch((e) => console.error("usage log failed:", (e as Error).message));
	if (scope.ctx) scope.ctx.waitUntil(p);
}

/** Monkeypatch server.registerTool so every registered callback is timed and logged. */
export function wrapToolRegistration(server: McpServer): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const original = (server as any).registerTool.bind(server) as (...a: unknown[]) => unknown;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(server as any).registerTool = (name: string, config: unknown, cb: (...a: unknown[]) => Promise<ToolResultLike>) =>
		original(name, config, async (...cbArgs: unknown[]) => {
			const args = cbArgs.length >= 2 ? cbArgs[0] : {};
			const t0 = Date.now();
			try {
				const result = await cb(...cbArgs);
				record(name, args, result, null, t0);
				return result;
			} catch (e) {
				record(name, args, null, e, t0);
				throw e;
			}
		});
}
