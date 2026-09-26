// End-to-end check of accounts, tokens, usage logging and admin routes against a running dev server.
// Requires DEV_LOGIN_SECRET in .dev.vars (local only).
// Usage: BASE_URL=http://localhost:8788 DEV_LOGIN_SECRET=dev-login node scripts/verify-accounts.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.BASE_URL ?? "http://localhost:8788";
const SECRET = process.env.DEV_LOGIN_SECRET ?? "dev-login";
const stamp = Date.now();

let failures = 0;
function check(label, ok, detail = "") {
	console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -> ${detail}` : ""}`);
	if (!ok) failures++;
}

/** Minimal cookie-jar fetch. */
function session() {
	let cookie = "";
	return async function f(path, init = {}) {
		const headers = { "X-Requested-With": "fetch", Accept: "application/json", ...(init.headers ?? {}) };
		if (cookie) headers.Cookie = cookie;
		if (init.json !== undefined) {
			headers["Content-Type"] = "application/json";
			init.body = JSON.stringify(init.json);
		}
		const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
		const set = res.headers.getSetCookie?.() ?? [];
		for (const c of set) {
			const [pair] = c.split(";");
			const [k, v] = pair.split("=");
			if (v === "" || /Max-Age=0/.test(c)) cookie = cookie.replace(new RegExp(`${k}=[^;]*;? ?`), "");
			else cookie = `${cookie ? `${cookie}; ` : ""}${k}=${v}`;
		}
		let data = null;
		try {
			data = await res.clone().json();
		} catch {}
		return { status: res.status, data, res };
	};
}

async function mcpCall(token, name, args) {
	const client = new Client({ name: "verify-accounts", version: "0.0.0" });
	try {
		await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
		const r = await client.callTool({ name, arguments: args });
		await client.close();
		return { ok: !r.isError, data: r.structuredContent };
	} catch (e) {
		return { ok: false, error: e };
	}
}

// ---- unauthenticated
let r = await fetch(`${BASE}/api/me`);
check("GET /api/me without session -> 200 with null user", r.status === 200 && (await r.json()).user === null);
r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("POST /mcp without token -> 401", r.status === 401);
r = await fetch(`${BASE}/health`);
check("GET /health -> 200", r.status === 200);

// ---- user A (regular)
const A = session();
r = await A(`/auth/dev-login?secret=${SECRET}&email=alice-${stamp}@example.com&name=Alice&json=1`);
check("dev-login user A", r.status === 200 && r.data?.user?.email?.startsWith("alice"), JSON.stringify(r.data));
r = await A("/api/me");
check("GET /api/me as A", r.status === 200 && r.data.is_admin === false, r.data?.user?.email);
r = await A("/api/tokens", { method: "POST", json: { name: "Laptop" } });
check("POST /api/tokens -> plaintext once", r.status === 201 && r.data.token?.startsWith("bp_") && r.data.record?.token_prefix?.length === 10);
const tokenA = r.data.token;
const tokenAId = r.data.record.id;
r = await A("/api/tokens", { method: "POST", json: { name: "" } });
check("POST /api/tokens empty name -> 400", r.status === 400);
r = await A("/api/tokens", { method: "POST", headers: { "X-Requested-With": "" }, json: { name: "x" } });
check("mutation without CSRF header -> 403", r.status === 403);
r = await A("/api/tokens");
check("GET /api/tokens lists 1 active", r.status === 200 && r.data.tokens.filter((t) => !t.revoked_at).length === 1);

// ---- use the token on /mcp
let c = await mcpCall(tokenA, "get_pokemon_by_dex_number", { number: 25 });
check("/mcp with user token: get_pokemon_by_dex_number", c.ok && c.data?.name === "Pikachu", c.error?.message);
c = await mcpCall(tokenA, "get_pokemon", { name: "Notapokemon" });
check("/mcp with user token: error result logged as error", !c.ok);
c = await mcpCall("bp_definitely_not_a_real_token_value_1234567890", "get_pokemon", { name: "Pikachu" });
check("/mcp with bogus bp_ token -> rejected", !c.ok);

// usage rows are written via waitUntil; give them a moment
await new Promise((res) => setTimeout(res, 1500));
r = await A("/api/usage/events?limit=10");
check("GET /api/usage/events shows 2 calls", r.status === 200 && r.data.total === 2, `total ${r.data?.total}`);
const expectedCallsForAlice = 4;
const evs = r.data.events;
check("events: tool names + ok flags + token name", evs.some((e) => e.tool === "get_pokemon_by_dex_number" && e.ok) && evs.some((e) => e.tool === "get_pokemon" && !e.ok && e.error) && evs.every((e) => e.token_name === "Laptop"));
r = await A("/api/usage/summary?days=7");
check("GET /api/usage/summary totals", r.data.total_calls === 2 && r.data.error_calls === 1 && r.data.by_tool.length === 2 && r.data.by_day.length === 1);
r = await A("/api/tokens", { method: "POST", headers: { "X-Requested-With": "fetch" }, json: { name: "Phone" } });
check("second token created", r.status === 201);
r = await A("/api/admin/users");
check("admin route as regular user -> 403", r.status === 403);

// ---- expiry (TTL)
r = await A("/api/tokens", { method: "POST", json: { name: "Bad ttl", ttl: "2y" } });
check("POST /api/tokens with invalid ttl -> 400", r.status === 400);
r = await A("/api/tokens", { method: "POST", json: { name: "Short lived", ttl: "7d" } });
check("token with ttl 7d has expires_at ~7 days out", r.status === 201 && Math.abs(new Date(r.data.record.expires_at).getTime() - Date.now() - 7 * 86400e3) < 60e3, r.data?.record?.expires_at);
const shortId = r.data.record.id;
r = await A("/api/tokens", { method: "POST", json: { name: "Forever", ttl: "never" } });
check("token with ttl never has null expires_at", r.status === 201 && r.data.record.expires_at === null);
const foreverToken = r.data.token;
// Simulate expiry through the dev-only backdoor: set expires_at in the past on the short-lived token.
r = await A(`/auth/dev-expire-token?secret=${SECRET}&id=${shortId}`);
check("dev-expire-token marks token expired", r.status === 200 && r.data?.expired === true);
r = await A("/api/tokens");
check("expired token is deleted on listing", r.status === 200 && !r.data.tokens.some((t) => t.id === shortId), `${r.data?.tokens?.length} tokens left`);
r = await A("/api/tokens", { method: "POST", json: { name: "Expires soon", ttl: "5m" } });
const soonToken = r.data.token;
const soonId = r.data.record.id;
c = await mcpCall(soonToken, "get_pokemon_by_dex_number", { number: 4 });
check("/mcp with fresh 5m token works", c.ok && c.data?.name === "Charmander");
r = await A(`/auth/dev-expire-token?secret=${SECRET}&id=${soonId}`);
check("expire the 5m token", r.status === 200);
c = await mcpCall(soonToken, "get_pokemon_by_dex_number", { number: 4 });
check("/mcp with expired token -> rejected (cache honours expiry)", !c.ok);
await new Promise((res) => setTimeout(res, 800));
r = await A("/api/tokens");
check("presented-expired token was deleted from db", !r.data.tokens.some((t) => t.id === soonId));
c = await mcpCall(foreverToken, "get_pokemon_by_dex_number", { number: 7 });
check("/mcp with never-expiring token still works", c.ok && c.data?.name === "Squirtle");
await new Promise((res) => setTimeout(res, 800));
r = await A("/api/usage/events?limit=10");
check("usage rows keep the token name after deletion", r.data.events.some((e) => e.token_name === "Expires soon"), r.data.events.map((e) => e.token_name).join(","));

// ---- revoke and re-check
r = await A(`/api/tokens/${tokenAId}`, { method: "DELETE" });
check("DELETE /api/tokens/:id -> revoked", r.status === 200 && r.data.revoked === true);
c = await mcpCall(tokenA, "get_pokemon_by_dex_number", { number: 1 });
check("/mcp with revoked token -> rejected", !c.ok);

// ---- admin B
const B = session();
r = await B(`/auth/dev-login?secret=${SECRET}&email=admin-${stamp}@example.com&name=Admin&admin=1&json=1`);
check("dev-login admin B", r.status === 200 && r.data?.user?.is_admin === true);
r = await B("/api/admin/summary?days=7");
check("admin summary", r.status === 200 && r.data.users >= 2 && r.data.calls_period >= 4 && Array.isArray(r.data.by_tool), JSON.stringify({ users: r.data?.users, calls: r.data?.calls_period }));
r = await B("/api/admin/users");
const alice = r.data.users.find((u) => u.email === `alice-${stamp}@example.com`);
check("admin users lists A with counts", !!alice && alice.call_count === expectedCallsForAlice && alice.error_count === 1 && alice.active_token_count === 2, JSON.stringify({ calls: alice?.call_count, active: alice?.active_token_count, tokens: alice?.token_count }));
r = await B(`/api/admin/users/${alice.id}`);
check("admin user detail: tokens + usage", r.status === 200 && r.data.tokens.length >= 3 && r.data.usage.total_calls === expectedCallsForAlice);
r = await B(`/api/admin/events?tool=get_pokemon&user_id=${alice.id}`);
check("admin events filter by tool+user", r.status === 200 && r.data.total === 1 && r.data.events[0].user_email === alice.email);
const phone = (await B(`/api/admin/users/${alice.id}`)).data.tokens.find((t) => t.name === "Phone");
r = await B(`/api/admin/tokens/${phone.id}/revoke`, { method: "POST" });
check("admin revokes A's token", r.status === 200 && r.data.revoked === true);
r = await B(`/api/admin/users/${alice.id}`, { method: "POST", json: { is_admin: true } });
check("admin promotes A", r.status === 200 && r.data.user.is_admin === true);
r = await A("/api/me");
check("A now sees is_admin (session cache invalidated)", r.data.is_admin === true);
r = await B(`/api/admin/users/${alice.id}`, { method: "POST", json: { is_admin: false } });
check("admin demotes A", r.status === 200 && r.data.user.is_admin === false);
const meB = (await B("/api/me")).data.user.id;
r = await B(`/api/admin/users/${meB}`, { method: "POST", json: { is_admin: false } });
check("admin cannot demote self", r.status === 400);

// ---- logout
r = await A("/auth/logout", { method: "POST" });
check("POST /auth/logout -> 204", r.status === 204);
r = await A("/api/me");
check("after logout /api/me -> null user", r.status === 200 && r.data.user === null);

// ---- scheduled sweep (Cron Trigger) via the local test endpoint
r = await fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=0+*/6+*+*+*`);
check("scheduled handler runs locally", r.status === 200, `status ${r.status}`);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
