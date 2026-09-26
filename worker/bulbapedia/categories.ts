import { apiGet } from "./client.ts";
import { intToRoman } from "../wikitext/templates.ts";

export const TYPES = [
	"Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying",
	"Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
] as const;
export type PokemonType = (typeof TYPES)[number];

export const EGG_GROUPS = [
	"Monster", "Water 1", "Bug", "Flying", "Field", "Fairy", "Grass", "Human-Like", "Water 3", "Mineral",
	"Amorphous", "Water 2", "Ditto", "Dragon", "No Eggs Discovered", "Unknown",
] as const;
export type EggGroup = (typeof EGG_GROUPS)[number];

/** Case-insensitive lookup of a user-supplied value in an enum list. */
export function matchEnum<T extends string>(value: string, options: readonly T[]): T | null {
	const v = value.trim().toLowerCase().replace(/[-_]/g, " ");
	return options.find((o) => o.toLowerCase().replace(/[-_]/g, " ") === v) ?? null;
}

export const category = {
	pokemonByGeneration: (gen: number) => `Generation ${intToRoman(gen)} Pokémon`,
	pokemonByType: (type: string) => `${type}-type Pokémon`,
	pokemonByEggGroup: (group: string) => `${group} group Pokémon`,
	legendary: "Legendary Pokémon",
	mythical: "Mythical Pokémon",
	movesByType: (type: string) => `${type}-type moves`,
	movesByCategory: (cat: "physical" | "special" | "status") => `${cat[0].toUpperCase()}${cat.slice(1)} moves`,
	movesByGeneration: (gen: number) => `Generation ${intToRoman(gen)} moves`,
	allMoves: "Moves",
	abilities: "Abilities",
	abilitiesByGeneration: (gen: number) => `Abilities introduced in Generation ${intToRoman(gen)}`,
};

export interface CategoryPage {
	titles: string[];
	continue: string | null;
}

/** One page of members of a category (main namespace only). */
export async function categoryMembers(name: string, limit = 500, cont?: string): Promise<CategoryPage> {
	const cmtitle = name.startsWith("Category:") ? name : `Category:${name}`;
	const d = await apiGet<{ continue?: { cmcontinue: string }; query: { categorymembers: { title: string }[] } }>({
		action: "query",
		list: "categorymembers",
		cmtitle,
		cmlimit: Math.min(500, Math.max(1, limit)),
		cmnamespace: 0,
		cmcontinue: cont,
	});
	return { titles: d.query.categorymembers.map((m) => m.title), continue: d.continue?.cmcontinue ?? null };
}

/** All members of a category, following continuation up to `cap` titles. */
export async function allCategoryMembers(name: string, cap = 2000): Promise<string[]> {
	const out: string[] = [];
	let cont: string | undefined;
	while (out.length < cap) {
		const page = await categoryMembers(name, 500, cont);
		out.push(...page.titles);
		if (!page.continue) break;
		cont = page.continue;
	}
	return out.slice(0, cap);
}

/** Strip a disambiguation suffix: "Pikachu (Pokémon)" -> "Pikachu". */
export function stripSuffix(title: string, suffix: string): string {
	const s = ` (${suffix})`;
	return title.endsWith(s) ? title.slice(0, -s.length) : title;
}
