/**
 * Thin client for Bulbapedia's MediaWiki API. Only `/w/api.php` is used: the HTML pages are
 * behind a bot challenge and are never fetched. Responses are cached in the Workers Cache API.
 */
import { requestScope } from "../scope.ts";

export { requestScope };
export type { CallerIdentity, RequestScope } from "../scope.ts";

export const API_URL = "https://bulbapedia.bulbagarden.net/w/api.php";
export const WIKI_URL = "https://bulbapedia.bulbagarden.net/wiki/";
export const USER_AGENT = "bulbapedia-mcp/0.2 (MCP server; https://bulbapedia.bulbagarden.net API client)";
const DEFAULT_TTL_SECONDS = 3600;

export class BulbapediaError extends Error {
	constructor(
		message: string,
		public readonly code: string = "bulbapedia_error",
	) {
		super(message);
		this.name = "BulbapediaError";
	}
}

export type Params = Record<string, string | number | boolean | undefined>;

export function buildUrl(params: Params): string {
	const url = new URL(API_URL);
	url.searchParams.set("format", "json");
	url.searchParams.set("formatversion", "2");
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined) continue;
		url.searchParams.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
	}
	url.searchParams.sort();
	return url.toString();
}

function cacheStore(): Cache | undefined {
	const g = globalThis as { caches?: { default?: Cache } };
	return g.caches?.default;
}

/** GET the API with caching. Throws BulbapediaError on HTTP or API-level errors. */
export async function apiGet<T = unknown>(params: Params, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<T> {
	const url = buildUrl(params);
	const req = new Request(url, { method: "GET", headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
	const cache = cacheStore();
	if (cache) {
		const hit = await cache.match(req);
		if (hit) return (await hit.json()) as T;
	}
	let res: Response;
	try {
		res = await fetch(req);
	} catch (e) {
		throw new BulbapediaError(`Network error reaching Bulbapedia: ${(e as Error).message}`, "network");
	}
	if (!res.ok) throw new BulbapediaError(`Bulbapedia API returned HTTP ${res.status}`, `http_${res.status}`);
	const text = await res.text();
	let data: { error?: { code: string; info: string } } & T;
	try {
		data = JSON.parse(text);
	} catch {
		throw new BulbapediaError("Bulbapedia API returned non-JSON (possibly a bot challenge page)", "non_json");
	}
	if (data.error) throw new BulbapediaError(`Bulbapedia API error: ${data.error.info}`, data.error.code);
	if (cache && ttlSeconds > 0) {
		const stored = new Response(text, {
			status: 200,
			headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttlSeconds}` },
		});
		const put = cache.put(req, stored);
		const ctx = requestScope.getStore()?.ctx;
		if (ctx) ctx.waitUntil(put);
		else await put;
	}
	return data;
}

export function pageUrl(title: string): string {
	return (
		WIKI_URL +
		encodeURIComponent(title.replace(/ /g, "_")).replace(/%3A/g, ":").replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")")
	);
}

// ---- Typed helpers -------------------------------------------------------------------------

export interface SearchHit {
	title: string;
	snippet: string;
	size: number;
	wordcount: number;
}

export const NAMESPACES: Record<string, number> = { main: 0, file: 6, category: 14, template: 10, help: 12, bulbapedia: 4 };

export async function search(query: string, limit: number, namespace = 0): Promise<SearchHit[]> {
	const d = await apiGet<{ query: { search: { title: string; snippet: string; size: number; wordcount: number }[] } }>({
		action: "query",
		list: "search",
		srsearch: query,
		srlimit: limit,
		srnamespace: namespace,
		srprop: "snippet|size|wordcount",
	});
	return d.query.search.map((s) => ({ title: s.title, snippet: s.snippet, size: s.size, wordcount: s.wordcount }));
}

export async function prefixSearch(query: string, limit: number, namespace = 0): Promise<string[]> {
	const d = await apiGet<{ query: { prefixsearch: { title: string }[] } }>({
		action: "query",
		list: "prefixsearch",
		pssearch: query,
		pslimit: limit,
		psnamespace: namespace,
	});
	return d.query.prefixsearch.map((p) => p.title);
}

interface QueryPage {
	title: string;
	missing?: boolean;
	invalid?: boolean;
	extract?: string;
	original?: { source: string; width: number; height: number };
	categories?: { title: string }[];
}

/** Resolve a loosely written title (redirects, capitalisation) to its canonical page title, or null. */
export async function resolveTitle(title: string): Promise<string | null> {
	const d = await apiGet<{ query?: { pages?: QueryPage[] } }>({ action: "query", titles: title, redirects: 1 });
	const page = d.query?.pages?.[0];
	if (!page || page.missing || page.invalid) return null;
	return page.title;
}

export interface Extract {
	title: string;
	extract: string;
	image: string | null;
}

export async function getExtract(title: string, intro: boolean): Promise<Extract | null> {
	const d = await apiGet<{ query?: { pages?: QueryPage[] } }>({
		action: "query",
		titles: title,
		redirects: 1,
		prop: "extracts|pageimages",
		explaintext: 1,
		exintro: intro ? 1 : undefined,
		exsectionformat: "plain",
		piprop: "original",
	});
	const page = d.query?.pages?.[0];
	if (!page || page.missing) return null;
	return { title: page.title, extract: page.extract ?? "", image: page.original?.source ?? null };
}

export interface Section {
	index: string;
	level: number;
	line: string;
	anchor: string;
}

export async function getSections(title: string): Promise<{ title: string; sections: Section[] }> {
	const d = await apiGet<{ parse: { title: string; sections: { index: string; toclevel: number; line: string; anchor: string }[] } }>({
		action: "parse",
		page: title,
		prop: "sections",
		redirects: 1,
	});
	return { title: d.parse.title, sections: d.parse.sections.map((s) => ({ index: s.index, level: s.toclevel, line: s.line, anchor: s.anchor })) };
}

export async function getSectionWikitext(title: string, section: string | number): Promise<string> {
	const d = await apiGet<{ parse: { wikitext: string } }>({ action: "parse", page: title, prop: "wikitext", section: String(section), redirects: 1 });
	return d.parse.wikitext;
}

export async function getPageWikitext(title: string): Promise<string> {
	const d = await apiGet<{ parse: { wikitext: string } }>({ action: "parse", page: title, prop: "wikitext", redirects: 1 });
	return d.parse.wikitext;
}

/** Wikitext of a whole page, or null if it does not exist. */
export async function getPageWikitextOrNull(title: string): Promise<string | null> {
	try {
		return await getPageWikitext(title);
	} catch (e) {
		if (e instanceof BulbapediaError && e.code === "missingtitle") return null;
		throw e;
	}
}

export async function getCategories(title: string): Promise<{ title: string; categories: string[] } | null> {
	const d = await apiGet<{ query?: { pages?: QueryPage[] } }>({
		action: "query",
		titles: title,
		redirects: 1,
		prop: "categories",
		cllimit: "max",
		clshow: "!hidden",
	});
	const page = d.query?.pages?.[0];
	if (!page || page.missing) return null;
	return { title: page.title, categories: (page.categories ?? []).map((c) => c.title.replace(/^Category:/, "")) };
}

/** Find a section by index or by heading text (case-insensitive; matches line or anchor). */
export function findSection(sections: Section[], ref: string | number): Section | undefined {
	const s = String(ref).trim();
	if (/^\d+$/.test(s)) return sections.find((x) => x.index === s);
	const lower = s.toLowerCase();
	return (
		sections.find((x) => x.line.toLowerCase() === lower) ??
		sections.find((x) => x.anchor.toLowerCase() === lower.replace(/ /g, "_")) ??
		sections.find((x) => x.line.toLowerCase().includes(lower))
	);
}

/**
 * Resolve an entity name like "pikachu" / "Pikachu (Pokémon)" to a canonical page title,
 * preferring the disambiguated form with `suffix` (e.g. "Pokémon", "move", "Ability").
 */
export async function resolveEntity(name: string, suffix: string): Promise<string | null> {
	const trimmed = name.trim();
	const wanted = ` (${suffix})`;
	const candidates = trimmed.toLowerCase().endsWith(wanted.toLowerCase()) ? [trimmed] : [`${trimmed}${wanted}`, trimmed];
	for (const c of candidates) {
		const resolved = await resolveTitle(c);
		if (resolved && resolved.toLowerCase().endsWith(wanted.toLowerCase())) return resolved;
	}
	return null;
}

export interface RecentChange {
	title: string;
	type: string;
	user: string;
	timestamp: string;
	comment: string;
	size_delta: number;
}

/** Recent edits to articles, newest first. Short cache so it stays fresh. */
export async function recentChanges(limit: number, namespace = 0): Promise<RecentChange[]> {
	const d = await apiGet<{ query: { recentchanges: { title: string; type: string; user?: string; timestamp: string; comment?: string; oldlen: number; newlen: number }[] } }>(
		{ action: "query", list: "recentchanges", rcnamespace: namespace, rclimit: limit, rcprop: "title|timestamp|user|comment|sizes", rctype: "edit|new", rcshow: "!bot" },
		120,
	);
	return d.query.recentchanges.map((c) => ({ title: c.title, type: c.type, user: c.user ?? "", timestamp: c.timestamp, comment: c.comment ?? "", size_delta: c.newlen - c.oldlen }));
}

export interface Revision {
	revid: number;
	user: string;
	timestamp: string;
	comment: string;
	size: number;
}

export async function pageHistory(title: string, limit: number): Promise<{ title: string; revisions: Revision[] } | null> {
	const d = await apiGet<{ query?: { pages?: (QueryPage & { revisions?: { revid: number; user?: string; timestamp: string; comment?: string; size: number }[] })[] } }>(
		{ action: "query", titles: title, redirects: 1, prop: "revisions", rvlimit: limit, rvprop: "ids|timestamp|user|comment|size" },
		300,
	);
	const page = d.query?.pages?.[0];
	if (!page || page.missing) return null;
	return { title: page.title, revisions: (page.revisions ?? []).map((r) => ({ revid: r.revid, user: r.user ?? "", timestamp: r.timestamp, comment: r.comment ?? "", size: r.size })) };
}
