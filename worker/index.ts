import { Hono } from "hono";
import { createMcpHandler } from "agents/mcp/server";
import type { AppEnv } from "./env.ts";
import { authenticateBearer } from "./auth.ts";
import { createSql, scopedSql } from "./db/client.ts";
import { purgeExpiredTokens } from "./db/queries.ts";
import { forgetAllTokens } from "./auth.ts";
import { authRoutes } from "./routes/auth.ts";
import { apiRoutes } from "./routes/api.ts";
import { requestScope, type RequestScope } from "./scope.ts";
import { SERVER_VERSION, createServer } from "./server.ts";

const MCP_ROUTE = "/mcp";
const mcpHandler = createMcpHandler(() => createServer(), { route: MCP_ROUTE });

const app = new Hono<{ Bindings: AppEnv }>();

/** Run every request inside a scope with a lazily created DB client that is closed after the response. */
app.use("*", async (c, next) => {
	const scope: RequestScope = { ctx: c.executionCtx, dbConnectionString: c.env.DB?.connectionString };
	await requestScope.run(scope, () => next());
	if (scope.sql) {
		const sql = scope.sql;
		c.executionCtx.waitUntil(sql.end({ timeout: 5 }).catch(() => {}));
	}
});

app.get("/health", (c) => c.text(`bulbapedia-mcp ${SERVER_VERSION}\nMCP endpoint: ${MCP_ROUTE} (Streamable HTTP)\n`));

app.route("/auth", authRoutes);
app.route("/api", apiRoutes);

app.all(MCP_ROUTE, async (c) => {
	// CORS preflights carry no Authorization header; let the MCP handler answer them.
	if (c.req.method !== "OPTIONS") {
		const caller = await authenticateBearer(c.env, c.executionCtx, c.req.header("Authorization") ?? null, scopedSql);
		if (caller instanceof Response) return caller;
		const scope = requestScope.getStore();
		if (scope) scope.caller = caller;
	}
	return mcpHandler(c.req.raw, c.env, c.executionCtx as unknown as ExecutionContext);
});

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
	console.error("unhandled error:", err);
	return c.json({ error: "internal error", message: err.message }, 500);
});

/** Cron: delete expired tokens and keep the database awake (Supabase pauses idle free projects). */
async function scheduled(_event: ScheduledController, env: AppEnv, ctx: ExecutionContext): Promise<void> {
	if (!env.DB) return;
	const sql = createSql(env.DB.connectionString);
	try {
		const purged = await purgeExpiredTokens(sql);
		if (purged) forgetAllTokens();
		console.log(`scheduled sweep: removed ${purged} expired token(s)`);
	} finally {
		ctx.waitUntil(sql.end({ timeout: 5 }).catch(() => {}));
	}
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<AppEnv>;
