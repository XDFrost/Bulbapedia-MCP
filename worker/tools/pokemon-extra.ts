import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { findSection, getPageWikitextOrNull, getSectionWikitext, getSections, pageUrl, resolveEntity, resolveTitle } from "../bulbapedia/client.ts";
import { classifySprite, fileUrls, sectionImages, standardImageNames } from "../bulbapedia/images.ts";
import { parsePokemonInfobox } from "../parsers/pokemon.ts";
import { intToRoman } from "../wikitext/templates.ts";
import { parseDexEntries, parseEvolution, parseGameLocations, parseHeldItems, parseLearnset, parseOtherLanguages, parseTypeEffectiveness } from "../parsers/species-extra.ts";
import { json, notFound, safe } from "./shared.ts";

async function speciesSection(name: string, heading: string, ...fallbacks: string[]) {
	const title = await resolveEntity(name, "Pokémon");
	if (!title) return null;
	const { sections } = await getSections(title);
	let sec = findSection(sections, heading);
	for (const f of fallbacks) if (!sec) sec = findSection(sections, f);
	if (!sec) return { title, wikitext: null, sections };
	return { title, wikitext: await getSectionWikitext(title, sec.index), sections };
}

const nameArg = z.object({ name: z.string().min(1).describe("Species name, e.g. 'Pikachu'") });

export function registerPokemonExtraTools(server: McpServer) {
	server.registerTool(
		"get_pokemon_learnset",
		{
			title: "Get Pokémon learnset",
			description:
				"Moves a Pokémon can learn, grouped by method: level-up, TM/TR/HM, breeding (egg moves with parents), tutor, from a pre-evolution, and event. Defaults to the newest generation on the main page; pass generation (1-8) for an older generation's learnset subpage. Each move has type, category, power, accuracy, PP.",
			inputSchema: nameArg.extend({
				generation: z.number().int().min(1).max(9).optional().describe("Generation whose learnset to return; omit for the latest"),
				method: z.enum(["all", "level_up", "tm", "breeding", "tutor", "prevolution", "event"]).default("all"),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name, generation, method }) =>
			safe(async () => {
				const title = await resolveEntity(name, "Pokémon");
				if (!title) return notFound("Pokémon", name);
				let wikitext: string | null;
				let source: string;
				if (generation && generation <= 8) {
					source = `${title}/Generation ${intToRoman(generation)} learnset`;
					wikitext = await getPageWikitextOrNull(source);
					if (wikitext === null) return { content: [{ type: "text", text: `No Generation ${intToRoman(generation)} learnset page for ${title}.` }], isError: true };
				} else {
					source = title;
					const { sections } = await getSections(title);
					const sec = findSection(sections, "Learnset");
					wikitext = sec ? await getSectionWikitext(title, sec.index) : null;
					if (!wikitext) return { content: [{ type: "text", text: `No Learnset section on ${title}.` }], isError: true };
				}
				const ls = parseLearnset(wikitext);
				const data: Record<string, unknown> = { pokemon: title, generation: generation ?? "latest", games: ls.games, url: pageUrl(source) };
				const keys = method === "all" ? (["level_up", "tm", "breeding", "tutor", "prevolution", "event"] as const) : ([method] as const);
				for (const k of keys) data[k] = ls[k];
				return json(data);
			}),
	);

	server.registerTool(
		"get_type_effectiveness",
		{
			title: "Get type effectiveness",
			description: "Defensive type matchups for a Pokémon: damage multiplier from every attacking type, listed as weaknesses, resistances and immunities, plus ability caveats (e.g. Lightning Rod).",
			inputSchema: nameArg,
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const r = await speciesSection(name, "Type effectiveness");
				if (!r) return notFound("Pokémon", name);
				const te = r.wikitext ? parseTypeEffectiveness(r.wikitext) : null;
				if (!te) return { content: [{ type: "text", text: `No type effectiveness table on ${r.title}.` }], isError: true };
				return json({ pokemon: r.title, url: pageUrl(r.title), ...te });
			}),
	);

	server.registerTool(
		"get_evolution_chain",
		{
			title: "Get evolution chain",
			description: "Evolutionary family of a Pokémon: every stage with dex number, types, form, and the method to reach it (level, stone, friendship, location...). Handles branched families like Eevee.",
			inputSchema: nameArg,
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const r = await speciesSection(name, "Evolution data", "Evolution");
				if (!r) return notFound("Pokémon", name);
				if (!r.wikitext) return { content: [{ type: "text", text: `No evolution section on ${r.title}.` }], isError: true };
				return json({ pokemon: r.title, url: pageUrl(r.title), ...parseEvolution(r.wikitext) });
			}),
	);

	server.registerTool(
		"get_pokedex_entries",
		{
			title: "Get Pokédex entries",
			description: "In-game Pokédex flavor text for a Pokémon from every core game (with generation, game names and form), plus its regional Pokédex numbers.",
			inputSchema: nameArg,
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const r = await speciesSection(name, "Pokédex entries");
				if (!r) return notFound("Pokémon", name);
				if (!r.wikitext) return { content: [{ type: "text", text: `No Pokédex entries section on ${r.title}.` }], isError: true };
				return json({ pokemon: r.title, url: pageUrl(r.title), ...parseDexEntries(r.wikitext) });
			}),
	);

	server.registerTool(
		"get_pokemon_locations",
		{
			title: "Get Pokémon game locations",
			description: "Where a Pokémon can be obtained in each core game (routes, methods, trades, transfers), plus event distributions (game, name, region, level, date). Events are capped by max_events.",
			inputSchema: nameArg.extend({ max_events: z.number().int().min(0).max(500).default(50) }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name, max_events }) =>
			safe(async () => {
				const r = await speciesSection(name, "Game locations");
				if (!r) return notFound("Pokémon", name);
				if (!r.wikitext) return { content: [{ type: "text", text: `No Game locations section on ${r.title}.` }], isError: true };
				const g = parseGameLocations(r.wikitext);
				return json({ pokemon: r.title, url: pageUrl(r.title), locations: g.locations, events_total: g.events.length, events: g.events.slice(0, max_events) });
			}),
	);

	server.registerTool(
		"get_pokemon_held_items",
		{
			title: "Get wild held items",
			description: "Items a wild Pokémon may hold in each game, with the hold chance.",
			inputSchema: nameArg,
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const r = await speciesSection(name, "Held items");
				if (!r) return notFound("Pokémon", name);
				return json({ pokemon: r.title, url: pageUrl(r.title), held_items: r.wikitext ? parseHeldItems(r.wikitext) : [] });
			}),
	);

	server.registerTool(
		"get_names_in_other_languages",
		{
			title: "Get names in other languages",
			description: "Names of a Bulbapedia subject (Pokémon, move, item, location, type, episode...) in other languages, with name-origin notes where the wiki gives them. Works on any page with an 'In other languages' section.",
			inputSchema: z.object({ title: z.string().min(1).describe("Page title, e.g. 'Pikachu', 'Thunder Stone', 'Viridian Forest'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ title }) =>
			safe(async () => {
				const canonical = (await resolveEntity(title, "Pokémon")) ?? (await resolveEntity(title, "move")) ?? (await resolveEntity(title, "Ability")) ?? (await resolveTitle(title));
				if (!canonical) return notFound("page", title);
				const { sections } = await getSections(canonical);
				const sec = findSection(sections, "In other languages") ?? findSection(sections, "Names");
				const wikitext = sec ? await getSectionWikitext(canonical, sec.index) : await getSectionWikitext(canonical, 0);
				return json({ title: canonical, url: pageUrl(canonical), names: parseOtherLanguages(wikitext) });
			}),
	);

	server.registerTool(
		"get_pokemon_sprites",
		{
			title: "Get Pokémon sprites",
			description:
				"Image URLs for a Pokémon: official artwork, Pokémon HOME render, menu icon, and every game sprite shown in the page's Sprites section, classified by generation, game, shiny, back and female variants.",
			inputSchema: nameArg.extend({ include_game_sprites: z.boolean().default(true), shiny: z.boolean().optional().describe("Filter to shiny (true) or normal (false) game sprites") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name, include_game_sprites, shiny }) =>
			safe(async () => {
				const title = await resolveEntity(name, "Pokémon");
				if (!title) return notFound("Pokémon", name);
				const [lead, { sections }] = await Promise.all([getSectionWikitext(title, 0), getSections(title)]);
				const info = parsePokemonInfobox(lead);
				if (!info?.national_dex) return notFound("Pokémon", name);
				const std = standardImageNames(info.national_dex, info.name);
				const wanted = new Set<string>([std.artwork, std.home, std.menu]);
				if (include_game_sprites) {
					const sec = findSection(sections, "Sprites");
					if (sec) for (const f of await sectionImages(title, sec.index)) wanted.add(f);
				}
				const infos = await fileUrls([...wanted]);
				const sprites = infos
					.map((i) => ({ ...classifySprite(i.file), url: i.url, width: i.width, height: i.height }))
					.filter((s) => s.url)
					.filter((s) => shiny === undefined || s.kind !== "sprite" || s.shiny === shiny);
				const pick = (kind: string) => sprites.find((s) => s.kind === kind)?.url ?? null;
				return json({
					pokemon: title,
					national_dex: info.national_dex,
					url: pageUrl(title),
					artwork_url: pick("artwork"),
					home_render_url: pick("home"),
					menu_icon_url: pick("menu"),
					sprites: sprites.filter((s) => s.kind === "sprite" || s.kind === "other"),
				});
			}),
	);
}
