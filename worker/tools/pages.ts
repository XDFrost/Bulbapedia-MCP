import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getPageWikitextOrNull, pageUrl, resolveTitle } from "../bulbapedia/client.ts";
import { fileUrls } from "../bulbapedia/images.ts";
import { parseCharacter, parseEpisode, parseGame, parseItem, parseLocation, parseTcgCard, parseTypePage } from "../parsers/pages.ts";
import { TYPES, matchEnum } from "../bulbapedia/categories.ts";
import { json, notFound, safe } from "./shared.ts";

/** "thunder stone" -> "Thunder Stone"; MediaWiki only auto-capitalises the first letter. */
function titleCase(s: string): string {
	return s.replace(/(^|[\s-])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

/** Resolve a title trying several disambiguation suffixes, returning the page's full wikitext. */
async function loadPage(name: string, suffixes: string[]): Promise<{ title: string; wikitext: string } | null> {
	const base = name.trim();
	const bases = [...new Set([base, titleCase(base)])];
	const candidates = bases.flatMap((b) => [b, ...suffixes.map((s) => `${b} (${s})`)]);
	for (const c of candidates) {
		const title = await resolveTitle(c);
		if (!title) continue;
		const wikitext = await getPageWikitextOrNull(title);
		if (wikitext) return { title, wikitext };
	}
	return null;
}

export function registerPageTypeTools(server: McpServer) {
	server.registerTool(
		"get_item",
		{
			title: "Get item",
			description: "Structured data for an item: Japanese name, generation introduced, bag pocket per generation, buy/sell prices, fling power, per-game descriptions, effect text and how to obtain it.",
			inputSchema: z.object({ name: z.string().min(1).describe("Item name, e.g. 'Thunder Stone', 'Leftovers'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const page = await loadPage(name, ["item"]);
				const item = page ? parseItem(page.wikitext) : null;
				if (!page || !item) return notFound("item", name);
				const { raw_params, ...fields } = item;
				const icon = (await fileUrls([`Bag ${item.name} Sprite.png`]))[0];
				return json({ ...fields, icon_url: icon?.url ?? null, url: pageUrl(page.title), page_title: page.title, raw_params });
			}),
	);

	server.registerTool(
		"get_location",
		{
			title: "Get location",
			description: "Structured data for a route, town, city or area: region, map description, connections, wild Pokémon encounter tables per game (method, levels, rates), items on the ground, and trainers with their Pokémon.",
			inputSchema: z.object({
				name: z.string().min(1).describe("Location name, e.g. 'Viridian Forest', 'Kanto Route 1', 'Pallet Town'"),
				include_trainers: z.boolean().default(true),
				max_encounters: z.number().int().min(1).max(1000).default(200),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name, include_trainers, max_encounters }) =>
			safe(async () => {
				const page = await loadPage(name, ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea"]);
				const loc = page ? parseLocation(page.wikitext) : null;
				if (!page || !loc) return notFound("location", name);
				const { raw_params, encounters, trainers, ...fields } = loc;
				return json({ ...fields, encounters_total: encounters.length, encounters: encounters.slice(0, max_encounters), trainers: include_trainers ? trainers : undefined, url: pageUrl(page.title), page_title: page.title, raw_params });
			}),
	);

	server.registerTool(
		"get_type",
		{
			title: "Get type",
			description: "Everything about one of the 18 types: offensive and defensive matchups, average base stats of its Pokémon, Pokémon grouped as pure/primary/secondary, every move of that type with power/accuracy/PP/description, and related abilities.",
			inputSchema: z.object({ type: z.string().min(1).describe(`One of: ${TYPES.join(", ")}`), include_moves: z.boolean().default(true), include_pokemon: z.boolean().default(true) }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ type, include_moves, include_pokemon }) =>
			safe(async () => {
				const t = matchEnum(type, TYPES);
				if (!t) return { content: [{ type: "text", text: `Unknown type "${type}". Use one of: ${TYPES.join(", ")}` }], isError: true };
				const title = `${t} (type)`;
				const wikitext = await getPageWikitextOrNull(title);
				const info = wikitext ? parseTypePage(wikitext) : null;
				if (!info) return notFound("type", type);
				const { moves, pokemon, ...rest } = info;
				return json({ ...rest, pokemon: include_pokemon ? pokemon : undefined, moves: include_moves ? moves : undefined, url: pageUrl(title) });
			}),
	);

	server.registerTool(
		"get_episode",
		{
			title: "Get anime episode",
			description: "Anime episode by Bulbapedia code (EP001, AG001, DP001, BW001, XY001, SM001, JN001, HZ001...): titles, air dates, series, openings, plot summary, major events, and characters.",
			inputSchema: z.object({ code: z.string().min(2).describe("Episode code like 'EP001' or 'JN042'; a series prefix plus number is normalised (e.g. 'ep1' -> EP001)") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ code }) =>
			safe(async () => {
				const m = /^([A-Za-z]+)\s*0*(\d+)$/.exec(code.trim());
				const normalised = m ? `${m[1].toUpperCase()}${m[2].padStart(3, "0")}` : code.trim();
				const page = await loadPage(normalised, []);
				const ep = page ? parseEpisode(page.wikitext) : null;
				if (!page || !ep) return notFound("episode", code);
				const { raw_params, ...fields } = ep;
				return json({ ...fields, url: pageUrl(page.title), page_title: page.title, raw_params });
			}),
	);

	server.registerTool(
		"get_character",
		{
			title: "Get character",
			description: "A character from the games, anime or manga: profile (age, hometown, region, relatives...), anime/game/manga appearance data (debut, voice actors, counterparts), teams and titles, and the intro text.",
			inputSchema: z.object({ name: z.string().min(1).describe("Character name, e.g. 'Ash Ketchum', 'Professor Oak', 'Cynthia'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const page = await loadPage(name, ["anime", "game", "Adventures"]);
				const c = page ? parseCharacter(page.wikitext) : null;
				if (!page || !c) return notFound("character", name);
				return json({ ...c, url: pageUrl(page.title), page_title: page.title });
			}),
	);

	server.registerTool(
		"get_tcg_card",
		{
			title: "Get TCG card",
			description: "A Pokémon Trading Card Game card by its Bulbapedia title, e.g. 'Pikachu (Base Set 58)' or 'Charizard (Base Set 4)': card data, every print (set, number, rarity), attacks with energy cost and damage, Pokédex data and card text.",
			inputSchema: z.object({ title: z.string().min(1).describe("Card page title including set and number, e.g. 'Pikachu (Base Set 58)'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ title }) =>
			safe(async () => {
				const page = await loadPage(title, ["TCG"]);
				const card = page ? parseTcgCard(page.wikitext) : null;
				if (!page || !card) return notFound("TCG card", title);
				const image = card.image ? ((await fileUrls([card.image]))[0]?.url ?? null) : null;
				return json({ ...card, image_url: image, url: pageUrl(page.title), page_title: page.title });
			}),
	);

	server.registerTool(
		"get_game",
		{
			title: "Get game",
			description: "A Pokémon video game: platform, developer, publisher, generation, release dates per region, age ratings, and the intro text.",
			inputSchema: z.object({ name: z.string().min(1).describe("Game title, e.g. 'Pokémon Red and Blue Versions', 'Pokémon Scarlet and Violet'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const page = await loadPage(name, ["game"]);
				const g = page ? parseGame(page.wikitext) : null;
				if (!page || !g) return notFound("game", name);
				const { raw_params, ...fields } = g;
				return json({ ...fields, url: pageUrl(page.title), page_title: page.title, raw_params });
			}),
	);
}
