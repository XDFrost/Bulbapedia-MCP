import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { findSection, getExtract, getSectionWikitext, getSections, pageUrl, resolveEntity } from "../bulbapedia/client.ts";
import { speciesImages } from "../bulbapedia/images.ts";
import { parsePokemonInfobox, parseStatsBlocks, pickCurrentStats } from "../parsers/pokemon.ts";
import { json, notFound, safe } from "./shared.ts";

export async function fetchPokemon(name: string): Promise<Record<string, unknown> | null> {
	const title = await resolveEntity(name, "Pokémon");
	if (!title) return null;
	const [lead, { sections }, extract] = await Promise.all([getSectionWikitext(title, 0), getSections(title), getExtract(title, true)]);
	const info = parsePokemonInfobox(lead);
	if (!info) return null;
	const statsSection = findSection(sections, "Base stats") ?? findSection(sections, "Stats");
	let base_stats = null;
	let stats_history: unknown[] = [];
	if (statsSection) {
		const blocks = parseStatsBlocks(await getSectionWikitext(title, statsSection.index));
		const current = pickCurrentStats(blocks);
		if (current) {
			const { label, variant, ...stats } = current;
			base_stats = stats;
		}
		stats_history = blocks.map(({ variant, ...b }) => ({ ...b, game: variant === "Stats" ? "core series" : variant.replace("Stats/", "") }));
	}
	const { raw_params, ...fields } = info;
	const images = info.national_dex ? (await speciesImages([{ ndex: info.national_dex, name: info.name }])).get(info.national_dex) : undefined;
	return {
		...fields,
		base_stats,
		stats_history,
		summary: extract?.extract.trim() ?? null,
		artwork_url: extract?.image ?? images?.artwork_url ?? null,
		sprite_url: images?.sprite_url ?? null,
		icon_url: images?.icon_url ?? null,
		url: pageUrl(title),
		page_title: title,
		raw_params,
	};
}

export function registerPokemonTools(server: McpServer) {
	server.registerTool(
		"get_pokemon",
		{
			title: "Get Pokémon",
			description:
				"Structured data for one Pokémon species from its Bulbapedia page: National Dex number, types, category, height/weight, abilities (including hidden), egg groups, catch rate, base experience, gender ratio, generation, current base stats (and historical stat changes), alternate forms, a short summary, official artwork, HOME render (sprite_url) and menu icon URLs.",
			inputSchema: z.object({ name: z.string().min(1).describe("Species name, e.g. 'Pikachu' or 'Mr. Mime'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const data = await fetchPokemon(name);
				return data ? json(data) : notFound("Pokémon", name);
			}),
	);
}
