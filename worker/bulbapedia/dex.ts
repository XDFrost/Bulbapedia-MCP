import { getPageWikitext, requestScope } from "./client.ts";
import { parseDexList, type DexIndex, type DexRow } from "../parsers/dex.ts";

export const DEX_LIST_PAGE = "List of Pokémon by National Pokédex number";
const INDEX_CACHE_KEY = "https://bulbapedia-mcp.internal/dex-index/v1";
const INDEX_TTL_SECONDS = 86400;

let memo: { index: DexIndex; at: number } | null = null;
const MEMO_TTL_MS = 10 * 60 * 1000;

function cacheStore(): Cache | undefined {
	return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

/** Fetch and parse the National Dex list page, cached in-isolate and in the Cache API. */
export async function getDexIndex(): Promise<DexIndex> {
	if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.index;
	const cache = cacheStore();
	if (cache) {
		const hit = await cache.match(INDEX_CACHE_KEY);
		if (hit) {
			const index = (await hit.json()) as DexIndex;
			memo = { index, at: Date.now() };
			return index;
		}
	}
	const wikitext = await getPageWikitext(DEX_LIST_PAGE);
	const index = parseDexList(wikitext);
	memo = { index, at: Date.now() };
	if (cache) {
		const put = cache.put(
			INDEX_CACHE_KEY,
			new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${INDEX_TTL_SECONDS}` } }),
		);
		const ctx = requestScope.getStore()?.ctx;
		if (ctx) ctx.waitUntil(put);
		else await put;
	}
	return index;
}

export function speciesByNumber(index: DexIndex, n: number): { species: DexRow; forms: DexRow[] } | null {
	const species = index.species.find((r) => r.national_dex === n);
	if (!species) return null;
	return { species, forms: index.forms.filter((f) => f.national_dex === n) };
}

export type { DexIndex, DexRow };
