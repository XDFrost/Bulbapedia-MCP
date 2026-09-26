import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { NAMESPACES, pageUrl, prefixSearch, search } from "../bulbapedia/client.ts";
import { stripHtml } from "../wikitext/clean.ts";
import { json, safe } from "./shared.ts";

export function registerSearchTools(server: McpServer) {
	server.registerTool(
		"search_bulbapedia",
		{
			title: "Search Bulbapedia",
			description:
				"Search Bulbapedia (the Pokémon wiki). Use mode 'fulltext' for natural-language queries with snippets, or 'prefix' for title autocomplete (e.g. 'Char' -> Charizard, Charmander). Returns page titles you can pass to the other tools.",
			inputSchema: z.object({
				query: z.string().min(1).describe("Search text or title prefix"),
				limit: z.number().int().min(1).max(20).default(8).describe("Maximum results"),
				mode: z.enum(["fulltext", "prefix"]).default("fulltext"),
				namespace: z.enum(["main", "category", "template"]).default("main").describe("'main' for articles, 'category' to find category names for list_category_members. (Image files live on the separate Archives wiki and are not searchable; use get_pokemon_sprites or get_file_urls with known names.)"),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ query, limit, mode, namespace }) =>
			safe(async () => {
				const ns = NAMESPACES[namespace] ?? 0;
				if (mode === "prefix") {
					const titles = await prefixSearch(query, limit, ns);
					return json({ query, results: titles.map((title) => ({ title, url: pageUrl(title) })) });
				}
				const hits = await search(query, limit, ns);
				return json({ query, results: hits.map((h) => ({ title: h.title, snippet: stripHtml(h.snippet), words: h.wordcount, url: pageUrl(h.title) })) });
			}),
	);
}
