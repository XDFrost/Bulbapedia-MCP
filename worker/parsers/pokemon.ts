import { findAllTemplates, parseTemplate, parseTemplateParams, romanToInt } from "../wikitext/templates.ts";
import { cleanInline, parseFloatLoose, parseIntLoose } from "../wikitext/clean.ts";

export interface BaseStats {
	hp: number | null;
	attack: number | null;
	defense: number | null;
	sp_atk: number | null;
	sp_def: number | null;
	speed: number | null;
	total: number | null;
}

export interface StatsBlock extends BaseStats {
	/** Heading immediately above the block, e.g. "Generation VI onward" or "Partner Pikachu". */
	label: string;
	/** Template variant: "Stats" (core) or e.g. "Stats/PE" (Let's Go). */
	variant: string;
	special?: number | null;
}

export interface PokemonInfo {
	name: string;
	japanese_name: string | null;
	japanese_transliteration: string | null;
	national_dex: number | null;
	types: string[];
	category: string | null;
	height_m: number | null;
	weight_kg: number | null;
	abilities: { regular: string[]; hidden: string | null };
	egg_groups: string[];
	egg_cycles: number | null;
	catch_rate: number | null;
	base_exp: number | null;
	base_friendship: number | null;
	gender_ratio: string | null;
	generation: number | null;
	color: string | null;
	forms: string[];
	/** Unmapped infobox params, cleaned, for anything the fields above miss. */
	raw_params: Record<string, string>;
}

const GENDER: Record<number, string> = {
	0: "100% male",
	31: "87.5% male, 12.5% female",
	63: "75% male, 25% female",
	127: "50% male, 50% female",
	191: "25% male, 75% female",
	225: "12.5% male, 87.5% female",
	254: "100% female",
	255: "Genderless",
};

/** Parse the `{{Pokémon Infobox}}` from a species page's lead section wikitext. */
export function parsePokemonInfobox(wikitext: string): PokemonInfo | null {
	const t = parseTemplate(wikitext, "Pokémon Infobox");
	if (!t) return null;
	const p = t.named;
	const get = (k: string) => (p[k] !== undefined ? cleanInline(p[k]) : "");

	const types = [get("type1"), get("type2")].filter((x) => x && x !== "???");
	const regular = ["ability1", "ability2"].map(get).filter(Boolean);
	const hidden = get("abilityd") || null;
	const eggGroups = ["egggroup1", "egggroup2"].map(get).filter(Boolean);

	const forms: string[] = [];
	for (let i = 2; i <= 20; i++) {
		const raw = p[`form${i}`];
		if (raw === undefined) continue;
		if (raw.includes("{{")) continue; // rotating/randomised form names, not useful
		const v = cleanInline(raw);
		if (v) forms.push(v);
	}

	const genderCode = parseIntLoose(p.gendercode);
	const generation = romanToInt(get("generation")) ?? parseIntLoose(p.generation);

	const mapped = new Set([
		"name", "jname", "jtranslit", "ndex", "type1", "type2", "category", "height-m", "weight-kg",
		"ability1", "ability2", "abilityd", "egggroup1", "egggroup2", "eggcycles", "catchrate",
		"expyield", "friendship", "gendercode", "generation", "color",
	]);
	const raw_params: Record<string, string> = {};
	for (const [k, v] of Object.entries(p)) {
		if (mapped.has(k) || /^form\d+$/.test(k) || /^image\d*$/.test(k)) continue;
		if (v.includes("{{#")) continue;
		const c = cleanInline(v);
		if (c) raw_params[k] = c;
	}

	return {
		name: get("name"),
		japanese_name: get("jname") || null,
		japanese_transliteration: get("jtranslit") || null,
		national_dex: parseIntLoose(p.ndex),
		types,
		category: get("category") ? `${get("category")} Pokémon` : null,
		height_m: parseFloatLoose(p["height-m"]),
		weight_kg: parseFloatLoose(p["weight-kg"]),
		abilities: { regular, hidden },
		egg_groups: eggGroups,
		egg_cycles: parseIntLoose(p.eggcycles),
		catch_rate: parseIntLoose(p.catchrate),
		base_exp: parseIntLoose(p.expyield),
		base_friendship: parseIntLoose(p.friendship),
		gender_ratio: genderCode === null ? null : (GENDER[genderCode] ?? `gender code ${genderCode}`),
		generation,
		color: get("color") || null,
		forms,
		raw_params,
	};
}

function sumStats(s: Omit<BaseStats, "total">): number | null {
	const vals = [s.hp, s.attack, s.defense, s.sp_atk, s.sp_def, s.speed];
	if (vals.some((v) => v === null)) return null;
	return (vals as number[]).reduce((a, b) => a + b, 0);
}

/** Parse every `{{Stats ...}}` block in a "Base stats" section, labelled by the nearest heading above it. */
export function parseStatsBlocks(wikitext: string): StatsBlock[] {
	const matches = findAllTemplates(wikitext, (n) => n === "Stats" || n.startsWith("Stats/"));
	return matches.map((m) => {
		const p = parseTemplateParams(m.body).named;
		const before = wikitext.slice(0, m.start);
		const headings = [...before.matchAll(/^=+\s*(.*?)\s*=+\s*$/gm)];
		const label = headings.length ? cleanInline(headings[headings.length - 1][1]) : "";
		const core = {
			hp: parseIntLoose(p.HP),
			attack: parseIntLoose(p.Attack),
			defense: parseIntLoose(p.Defense),
			sp_atk: parseIntLoose(p.SpAtk),
			sp_def: parseIntLoose(p.SpDef),
			speed: parseIntLoose(p.Speed),
		};
		const block: StatsBlock = { label, variant: m.name, ...core, total: sumStats(core) };
		if (p.Special !== undefined) block.special = parseIntLoose(p.Special);
		return block;
	});
}

/** Pick the "current" core-series stats: the last plain `{{Stats}}` block (later generations come later). */
export function pickCurrentStats(blocks: StatsBlock[]): StatsBlock | null {
	const core = blocks.filter((b) => b.variant === "Stats");
	return core.length ? core[core.length - 1] : (blocks[0] ?? null);
}
