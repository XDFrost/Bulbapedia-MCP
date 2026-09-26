import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { pageUrl } from "../bulbapedia/client.ts";
import { EGG_GROUPS, TYPES, allCategoryMembers, category, categoryMembers, matchEnum, stripSuffix } from "../bulbapedia/categories.ts";
import { getDexIndex, speciesByNumber, type DexRow } from "../bulbapedia/dex.ts";
import { speciesImages } from "../bulbapedia/images.ts";
import { json, safe } from "./shared.ts";
import { fetchPokemon } from "./pokemon.ts";

function page<T>(items: T[], offset: number, limit: number) {
	const slice = items.slice(offset, offset + limit);
	const next = offset + limit < items.length ? offset + limit : null;
	return { total: items.length, offset, count: slice.length, next_offset: next, results: slice };
}

function rowOut(r: DexRow) {
	const out: Record<string, unknown> = { national_dex: r.national_dex, name: r.name, types: r.types, generation: r.generation };
	if (r.form) out.form = r.form;
	out.url = pageUrl(`${r.name} (Pokémon)`);
	return out;
}

async function withImages<T extends { national_dex: number | null; name: string }>(items: T[]): Promise<(T & { sprite_url: string | null; icon_url: string | null })[]> {
	const list = items.filter((r) => r.national_dex !== null).map((r) => ({ ndex: r.national_dex as number, name: r.name }));
	const imgs = await speciesImages(list);
	return items.map((r) => {
		const i = r.national_dex !== null ? imgs.get(r.national_dex) : undefined;
		return { ...r, sprite_url: i?.sprite_url ?? null, icon_url: i?.icon_url ?? null };
	});
}

async function intersectTitles(categories: string[]): Promise<Set<string> | null> {
	if (categories.length === 0) return null;
	const lists = await Promise.all(categories.map((c) => allCategoryMembers(c)));
	let set = new Set(lists[0]);
	for (const l of lists.slice(1)) set = new Set(l.filter((t) => set.has(t)));
	return set;
}

export function registerListTools(server: McpServer) {
	server.registerTool(
		"list_pokemon",
		{
			title: "List Pokémon",
			description:
				"Browse Pokémon by generation (1-10), type, egg group, and/or legendary/mythical status. Returns National Dex number, name and types for each match, in Dex order. Combine filters freely (e.g. generation 1 + type Electric). Set include_forms to also list regional/alternate forms.",
			inputSchema: z.object({
				generation: z.number().int().min(1).max(10).optional(),
				type: z.string().optional().describe(`One of: ${TYPES.join(", ")}`),
				egg_group: z.string().optional().describe(`One of: ${EGG_GROUPS.join(", ")}`),
				legendary: z.enum(["legendary", "mythical"]).optional(),
				include_forms: z.boolean().default(false),
				include_images: z.boolean().default(false).describe("Add HOME render (sprite_url) and menu icon (icon_url) per result; costs one extra API call per 16 results"),
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ generation, type, egg_group, legendary, include_forms, include_images, limit, offset }) =>
			safe(async () => {
				const typeName = type ? matchEnum(type, TYPES) : null;
				if (type && !typeName) return { content: [{ type: "text", text: `Unknown type "${type}". Use one of: ${TYPES.join(", ")}` }], isError: true };
				const eggName = egg_group ? matchEnum(egg_group, EGG_GROUPS) : null;
				if (egg_group && !eggName) return { content: [{ type: "text", text: `Unknown egg group "${egg_group}". Use one of: ${EGG_GROUPS.join(", ")}` }], isError: true };

				const index = await getDexIndex();
				let rows = include_forms ? [...index.species, ...index.forms].sort((a, b) => (a.national_dex ?? 9e9) - (b.national_dex ?? 9e9)) : index.species;
				if (generation) rows = rows.filter((r) => r.generation === generation);
				if (typeName) rows = rows.filter((r) => r.types.some((t) => t.toLowerCase() === typeName.toLowerCase()));

				const cats: string[] = [];
				if (eggName) cats.push(category.pokemonByEggGroup(eggName));
				if (legendary === "legendary") cats.push(category.legendary);
				if (legendary === "mythical") cats.push(category.mythical);
				const allowed = await intersectTitles(cats);
				if (allowed) rows = rows.filter((r) => allowed.has(`${r.name} (Pokémon)`));

				const paged = page(rows, offset, limit);
				const results = include_images
					? (await withImages(paged.results)).map((r) => ({ ...rowOut(r), sprite_url: r.sprite_url, icon_url: r.icon_url }))
					: paged.results.map(rowOut);
				return json({ filters: { generation, type: typeName, egg_group: eggName, legendary, include_forms }, ...paged, results });
			}),
	);

	server.registerTool(
		"get_pokemon_by_dex_number",
		{
			title: "Get Pokémon by National Dex number",
			description: "Look up a Pokémon by its National Pokédex number (1-1025). Returns name, types, generation, alternate forms and image URLs from the Dex index. Set full=true to also return the complete get_pokemon data.",
			inputSchema: z.object({ number: z.number().int().min(1).max(2000), full: z.boolean().default(false) }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ number, full }) =>
			safe(async () => {
				const index = await getDexIndex();
				const hit = speciesByNumber(index, number);
				if (!hit) return { content: [{ type: "text", text: `No Pokémon with National Dex number ${number}.` }], isError: true };
				const img = (await speciesImages([{ ndex: number, name: hit.species.name }])).get(number);
				const base = {
					...rowOut(hit.species),
					forms: hit.forms.map((f) => ({ form: f.form, types: f.types })),
					sprite_url: img?.sprite_url ?? null,
					icon_url: img?.icon_url ?? null,
					artwork_url: img?.artwork_url ?? null,
				};
				if (!full) return json(base);
				const details = await fetchPokemon(hit.species.name);
				return json({ ...base, details });
			}),
	);

	server.registerTool(
		"list_moves",
		{
			title: "List moves",
			description: "Browse moves by type, damage category (physical/special/status) and/or generation introduced. With no filters, lists every move. Returns move names; use get_move for details.",
			inputSchema: z.object({
				type: z.string().optional().describe(`One of: ${TYPES.join(", ")}`),
				category: z.enum(["physical", "special", "status"]).optional(),
				generation: z.number().int().min(1).max(9).optional(),
				limit: z.number().int().min(1).max(500).default(100),
				offset: z.number().int().min(0).default(0),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ type, category: cat, generation, limit, offset }) =>
			safe(async () => {
				const typeName = type ? matchEnum(type, TYPES) : null;
				if (type && !typeName) return { content: [{ type: "text", text: `Unknown type "${type}". Use one of: ${TYPES.join(", ")}` }], isError: true };
				const cats: string[] = [];
				if (typeName) cats.push(category.movesByType(typeName));
				if (cat) cats.push(category.movesByCategory(cat));
				if (generation) cats.push(category.movesByGeneration(generation));
				if (cats.length === 0) cats.push(category.allMoves);
				const set = (await intersectTitles(cats)) ?? new Set<string>();
				const titles = [...set].filter((t) => t.endsWith("(move)")).sort((a, b) => a.localeCompare(b));
				const results = titles.map((t) => ({ name: stripSuffix(t, "move"), url: pageUrl(t) }));
				return json({ filters: { type: typeName, category: cat, generation }, ...page(results, offset, limit) });
			}),
	);

	server.registerTool(
		"list_abilities",
		{
			title: "List Abilities",
			description: "Browse Abilities, optionally only those introduced in a given generation (3-9). Returns names; use get_ability for details.",
			inputSchema: z.object({
				generation: z.number().int().min(3).max(9).optional(),
				limit: z.number().int().min(1).max(500).default(100),
				offset: z.number().int().min(0).default(0),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ generation, limit, offset }) =>
			safe(async () => {
				const cat = generation ? category.abilitiesByGeneration(generation) : category.abilities;
				const titles = (await allCategoryMembers(cat)).filter((t) => t.endsWith("(Ability)")).sort((a, b) => a.localeCompare(b));
				const results = titles.map((t) => ({ name: stripSuffix(t, "Ability"), url: pageUrl(t) }));
				return json({ filters: { generation }, ...page(results, offset, limit) });
			}),
	);

	server.registerTool(
		"list_category_members",
		{
			title: "List category members",
			description:
				"Pages in any Bulbapedia category, e.g. 'Pokémon that evolve using Thunder Stone', 'Yellow-colored Pokémon', 'Signature moves', 'Kanto locations'. Discover category names with get_page_categories. Paginate with the returned continue token.",
			inputSchema: z.object({
				category: z.string().min(1).describe("Category name without the 'Category:' prefix"),
				limit: z.number().int().min(1).max(500).default(100),
				continue: z.string().optional().describe("Continuation token from a previous call"),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ category: cat, limit, continue: cont }) =>
			safe(async () => {
				const p = await categoryMembers(cat, limit, cont);
				return json({ category: cat, count: p.titles.length, continue: p.continue, results: p.titles.map((t) => ({ title: t, url: pageUrl(t) })) });
			}),
	);
}
