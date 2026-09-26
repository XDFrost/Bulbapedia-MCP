import { cleanInline, cleanWikitext } from "../wikitext/clean.ts";
import { findAllTemplates, parseTemplate, romanToInt } from "../wikitext/templates.ts";
import { cleanedNamed, isDamageCategory, numCell, rows } from "./rows.ts";

// ---------------------------------------------------------------- Learnset

export interface LearnMove {
	move: string;
	type: string | null;
	category: string | null;
	power: number | null;
	accuracy: number | null;
	pp: number | null;
}
export interface LevelMove extends LearnMove {
	level: number | null;
	level_label?: string;
	note?: string;
}
export interface TmMove extends LearnMove {
	machine: string;
}
export interface BreedMove extends LearnMove {
	parents: string[];
}
export interface PrevoMove extends LearnMove {
	from: string;
}
export interface EventMove extends LearnMove {
	source: string;
}
export interface Learnset {
	games: string[];
	level_up: LevelMove[];
	tm: TmMove[];
	breeding: BreedMove[];
	tutor: LearnMove[];
	prevolution: PrevoMove[];
	event: EventMove[];
}

function moveStats(p: string[], i: number, za: boolean): LearnMove {
	const move = cleanInline(p[i]);
	const type = cleanInline(p[i + 1]) || null;
	let j = i + 2;
	let category: string | null = null;
	if (isDamageCategory(p[j])) {
		category = cleanInline(p[j]);
		j++;
	}
	const power = numCell(p[j]);
	if (za) return { move, type, category, power, accuracy: null, pp: numCell(p[j + 1]) };
	return { move, type, category, power, accuracy: numCell(p[j + 1]), pp: numCell(p[j + 2]) };
}

const LEARN_ROW = /^learnlist\/(level|tm|breed|tutor|prevo|event)([a-z0-9]*)$/i;

export function parseLearnset(wikitext: string): Learnset {
	const out: Learnset = { games: [], level_up: [], tm: [], breeding: [], tutor: [], prevolution: [], event: [] };
	out.games = [...new Set([...wikitext.matchAll(/\{\{gameabbrev\w*\|([^|}]+)/g)].map((m) => m[1].trim()))];
	for (const r of rows(wikitext, (n) => LEARN_ROW.test(n))) {
		const m = LEARN_ROW.exec(r.name)!;
		const kind = m[1].toLowerCase();
		const suffix = m[2].toLowerCase();
		if (suffix === "h" || suffix === "f" || suffix.includes("null") || suffix.startsWith("h/") || suffix.startsWith("f/")) continue;
		const za = suffix === "za";
		const p = r.positional;
		if (kind === "level") {
			const i = za ? 2 : 1;
			const levelRaw = za ? p[1] : p[0];
			const level = numCell(levelRaw);
			const row: LevelMove = { level, ...moveStats(p, i, za) };
			if (level === null) row.level_label = cleanInline(levelRaw);
			if (za && cleanInline(p[0])) row.note = cleanInline(p[0]);
			if (row.move) out.level_up.push(row);
		} else if (kind === "tm") {
			const row: TmMove = { machine: cleanInline(p[0]), ...moveStats(p, 1, za) };
			if (row.move) out.tm.push(row);
		} else if (kind === "breed") {
			const parents = findAllTemplates(p[0] ?? "", (n) => n.toUpperCase().startsWith("MSP")).map((t) => {
				const parts = t.body.replace(/^\|/, "").split("|");
				return cleanInline(parts[1] ?? parts[0]);
			});
			const row: BreedMove = { parents, ...moveStats(p, 1, za) };
			if (row.move) out.breeding.push(row);
		} else if (kind === "tutor") {
			const row = moveStats(p, 0, za);
			if (row.move) out.tutor.push(row);
		} else if (kind === "prevo") {
			let i = 2;
			while (i < p.length && cleanInline(p[i]) === "") i++;
			const row: PrevoMove = { from: cleanInline(p[1]), ...moveStats(p, i, za) };
			if (row.move) out.prevolution.push(row);
		} else if (kind === "event") {
			const row: EventMove = { source: cleanInline(p[0]), ...moveStats(p, 1, za) };
			if (row.move) out.event.push(row);
		}
	}
	return out;
}

// ---------------------------------------------------------------- Type effectiveness

export const ALL_TYPES = [
	"Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel", "Fire", "Water", "Grass",
	"Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy",
];

export interface TypeEffectiveness {
	types: string[];
	multipliers: Record<string, number>;
	weaknesses: { type: string; multiplier: number }[];
	resistances: { type: string; multiplier: number }[];
	immunities: string[];
	ability_notes: Record<string, string>;
}

export function parseTypeEffectiveness(wikitext: string): TypeEffectiveness | null {
	const t = parseTemplate(wikitext, "TypeEffectiveness");
	if (!t) return null;
	const named = cleanedNamed(t);
	const types = [named.type1, named.type2].filter(Boolean);
	const multipliers: Record<string, number> = {};
	for (const ty of ALL_TYPES) {
		const v = numCell(t.named[ty]);
		if (v !== null) multipliers[ty] = v / 100;
	}
	const entries = Object.entries(multipliers);
	const ability_notes: Record<string, string> = {};
	for (const [k, v] of Object.entries(named)) {
		if (k === "type1" || k === "type2" || k === "notes" || ALL_TYPES.includes(k)) continue;
		ability_notes[k] = v;
	}
	return {
		types,
		multipliers,
		weaknesses: entries.filter(([, m]) => m > 1).map(([type, multiplier]) => ({ type, multiplier })),
		resistances: entries.filter(([, m]) => m > 0 && m < 1).map(([type, multiplier]) => ({ type, multiplier })),
		immunities: entries.filter(([, m]) => m === 0).map(([type]) => type),
		ability_notes,
	};
}

// ---------------------------------------------------------------- Evolution

export interface EvolutionStage {
	stage: number;
	branch: string | null;
	national_dex: number | null;
	name: string;
	form: string | null;
	types: string[];
	/** How this stage is reached from the previous one (null for the base stage). */
	method: string | null;
}
export interface EvolutionChain {
	stages: EvolutionStage[];
	/** For table-style boxes (e.g. Eevee) the methods in document order when they could not be paired. */
	methods_in_order?: string[];
	notes: string | null;
}

function branchStages(named: Record<string, string>): EvolutionStage[] {
	const stages: EvolutionStage[] = [];
	for (const [k, v] of Object.entries(named)) {
		const m = /^no(\d+)([a-z]?)$/.exec(k);
		if (!m) continue;
		const n = Number.parseInt(m[1], 10);
		const suffix = m[2];
		const id = `${n}${suffix}`;
		const types = [named[`type1-${id}`], named[`type2-${id}`]].map(cleanInline).filter(Boolean);
		let method: string | null = null;
		if (n > 1) {
			const raw = named[`evo${n - 1}${suffix}`] ?? named[`evo${n - 1}`];
			method = raw ? cleanInline(raw.replace(/<br\s*\/?>/gi, " ")) || null : null;
		}
		stages.push({
			stage: n,
			branch: suffix || null,
			national_dex: numCell(v),
			name: cleanInline(named[`name${id}`] ?? ""),
			form: cleanInline(named[`form${id}`] ?? "") || null,
			types,
			method,
		});
	}
	return stages.sort((a, b) => a.stage - b.stage || (a.branch ?? "").localeCompare(b.branch ?? ""));
}

export function parseEvolution(wikitext: string): EvolutionChain {
	const boxes = findAllTemplates(wikitext, (n) => n.startsWith("Evobox") && n !== "Evobox/Setup");
	const notesEnd = boxes[0]?.start ?? wikitext.indexOf("{{Evobox/Setup");
	const notesRaw = notesEnd > 0 ? wikitext.slice(0, notesEnd) : wikitext;
	const notes = cleanWikitext(notesRaw).replace(/^#+ .*\n?/gm, "").trim() || null;

	if (boxes.length) {
		const stages: EvolutionStage[] = [];
		for (const b of boxes) {
			const t = parseTemplate(wikitext.slice(b.start, b.end), b.name);
			if (t) stages.push(...branchStages(t.named));
		}
		return { stages, notes };
	}

	// Table layout: {{Evobox/Setup|image|Name|type1|type2|color|Stage label}} cells with method cells between.
	const setups = rows(wikitext, "Evobox/Setup");
	if (!setups.length) return { stages: [], notes };
	const stages: EvolutionStage[] = setups.map((s, i) => ({
		stage: i === 0 ? 1 : 2,
		branch: null,
		national_dex: numCell(s.positional[0]),
		name: cleanInline(s.positional[1]),
		form: null,
		types: [s.positional[2], s.positional[3]].map(cleanInline).filter((x, idx, arr) => x && arr.indexOf(x) === idx),
		method: null,
	}));
	// Method cells sit in the table row between the base-stage setup and the first evolution setup.
	// A cell may itself be a nested {| |} table listing alternative methods (e.g. Leafeon: Moss Rock or Leaf Stone).
	const between = wikitext.slice(setups[0].end, setups[1].start);
	const methods: string[] = [];
	let depth = 0;
	let cell: string[] | null = null;
	const flush = () => {
		if (!cell) return;
		const parts = cell.map((c) => cleanInline(c.replace(/<br\s*\/?>/gi, " ")).replace(/\s*↓\s*/g, " ").trim()).filter((c) => c && c !== "↓");
		if (parts.length) methods.push(parts.join(" or "));
		cell = null;
	};
	for (const rawLine of between.split("\n")) {
		const line = rawLine.trim();
		if (line.startsWith("{|")) {
			depth++;
			continue;
		}
		if (line.startsWith("|}")) {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (line === "|-") continue;
		if (line.startsWith("|")) {
			const content = line.slice(1).trim();
			if (depth === 0) {
				flush();
				cell = content ? [content] : [];
			} else if (cell) {
				if (content) cell.push(content);
			}
		} else if (cell && line) {
			cell.push(line);
		}
	}
	flush();
	if (methods.length === stages.length - 1) {
		methods.forEach((m, i) => {
			stages[i + 1].method = m;
		});
		return { stages, notes };
	}
	return { stages, methods_in_order: methods, notes };
}

// ---------------------------------------------------------------- Pokédex entries

export interface DexEntry {
	generation: number | null;
	games: string[];
	form: string | null;
	text: string;
}
export interface RegionalDexNumber {
	generation: number | null;
	region: string;
	number: number | null;
}

export function parseDexEntries(wikitext: string): { entries: DexEntry[]; regional_dex_numbers: RegionalDexNumber[] } {
	const entries: DexEntry[] = [];
	const regional: RegionalDexNumber[] = [];
	let generation: number | null = null;
	let form: string | null = null;
	for (const r of rows(wikitext, (n) => /^Dex\/(Gen\/\d+|Entry\d+|Form)$/i.test(n))) {
		if (/^Dex\/Gen/i.test(r.name)) {
			generation = romanToInt(cleanInline(r.named.gen ?? ""));
			form = null;
			for (let k = 1; k <= 8; k++) {
				const reg = r.named[`reg${k}`];
				if (!reg) continue;
				regional.push({ generation, region: cleanInline(reg), number: numCell(r.named[`num${k}`]) });
			}
		} else if (/^Dex\/Form$/i.test(r.name)) {
			form = cleanInline(r.positional[0]) || null;
		} else {
			const games = ["v", "v2", "v3", "v4"].map((k) => r.named[k]).filter(Boolean).map((g) => cleanInline(g));
			const text = cleanInline(r.named.entry ?? "");
			if (text) entries.push({ generation, games, form, text });
		}
	}
	return { entries, regional_dex_numbers: regional };
}

// ---------------------------------------------------------------- Game locations

export interface LocationEntry {
	generation: number | null;
	games: string[];
	note: string | null;
	area: string;
	obtainable: boolean;
}
export interface EventEntry {
	game: string;
	name: string;
	language: string;
	region: string;
	level: number | null;
	date: string;
}

export function parseGameLocations(wikitext: string): { locations: LocationEntry[]; events: EventEntry[] } {
	const locations: LocationEntry[] = [];
	let generation: number | null = null;
	for (const r of rows(wikitext, (n) => /^Availability\/(Gen|Entry\d+(\/None)?)$/i.test(n))) {
		if (/^Availability\/Gen$/i.test(r.name)) {
			generation = romanToInt(cleanInline(r.named.gen ?? ""));
			continue;
		}
		const games = ["v", "v2", "v3", "v4"].map((k) => r.named[k]).filter(Boolean).map((g) => cleanInline(g));
		const area = cleanInline((r.named.area ?? "").replace(/<br\s*\/?>/gi, "; "));
		locations.push({ generation, games, note: cleanInline(r.named.ex ?? "") || null, area, obtainable: !/\/None$/i.test(r.name) });
	}
	const events: EventEntry[] = rows(wikitext, "eventAvail").map((r) => {
		const p = r.positional;
		const abbrevs = [...(p[0] ?? "").matchAll(/\{\{gameabbrev\w*\|([^|}]+)/g)].map((m) => m[1]);
		return {
			game: abbrevs.length ? abbrevs.join("/") : cleanInline(p[0]),
			name: cleanInline(p[1]),
			language: cleanInline(p[2]),
			region: cleanInline(p[3]),
			level: numCell(p[4]),
			date: cleanInline(p[5]),
		};
	});
	return { locations, events };
}

// ---------------------------------------------------------------- Held items

export interface HeldItemGroup {
	games: string[];
	items: { item: string; chance: string }[];
}

function itemName(raw: string): string {
	const s = raw.replace(/\{\{!\}\}/g, "|");
	const parts = s.split("|");
	return cleanInline(parts[parts.length - 1]);
}

export function parseHeldItems(wikitext: string): HeldItemGroup[] {
	const out: HeldItemGroup[] = [];
	let current: HeldItemGroup | null = null;
	for (const r of rows(wikitext, (n) => /^HeldItems\/(Games\d+|Items\w+)$/i.test(n))) {
		const g = /^HeldItems\/Games(\d+)$/i.exec(r.name);
		if (g) {
			const n = Number.parseInt(g[1], 10);
			current = { games: r.positional.slice(0, n).map(cleanInline), items: [] };
			out.push(current);
			continue;
		}
		if (!current) {
			current = { games: [], items: [] };
			out.push(current);
		}
		const p = r.positional;
		for (let i = 0; i + 1 < p.length; i += 2) {
			const item = itemName(p[i]);
			if (item && item.toLowerCase() !== "none") current.items.push({ item, chance: cleanInline(p[i + 1]) });
		}
	}
	return out.filter((g) => g.items.length);
}

// ---------------------------------------------------------------- Other languages

const LANG_NAMES: Record<string, string> = {
	ja: "Japanese", en: "English", fr: "French", es: "Spanish", de: "German", it: "Italian", ko: "Korean",
	zh_yue: "Cantonese Chinese", zh_cmn: "Mandarin Chinese", zh: "Chinese", ru: "Russian", pt: "Portuguese", pt_br: "Brazilian Portuguese",
	pt_eu: "European Portuguese", th: "Thai", vi: "Vietnamese", hi: "Hindi", ar: "Arabic", nl: "Dutch", pl: "Polish", sv: "Swedish", da: "Danish", fi: "Finnish",
	no: "Norwegian", cs: "Czech", hu: "Hungarian", tr: "Turkish", el: "Greek", he: "Hebrew", id: "Indonesian", ms: "Malay", ro: "Romanian", uk: "Ukrainian", bg: "Bulgarian",
	hr: "Croatian", sr: "Serbian", sk: "Slovak", sl: "Slovenian", lt: "Lithuanian", lv: "Latvian", et: "Estonian", ca: "Catalan", ca_ct: "Catalan", eu: "Basque", gl: "Galician",
	fa: "Persian", ta: "Tamil", te: "Telugu", bn: "Bengali", mn: "Mongolian", ka: "Georgian", is: "Icelandic", ur: "Urdu", la: "Latin",
};

export interface LanguageName {
	code: string;
	language: string;
	name: string;
	meaning: string | null;
}

export function parseOtherLanguages(wikitext: string): LanguageName[] {
	const t = parseTemplate(wikitext, "Other languages") ?? parseTemplate(wikitext, "langtable") ?? parseTemplate(wikitext, "Epilang");
	if (!t) return [];
	const out: LanguageName[] = [];
	for (const [k, v] of Object.entries(t.named)) {
		if (/meaning$/.test(k) || ["type", "type2", "color", "bordercolor"].includes(k)) continue;
		const name = cleanInline(v.replace(/<br\s*\/?>/gi, " / "));
		if (!name) continue;
		const meaning = cleanInline(t.named[`${k}meaning`] ?? "") || null;
		out.push({ code: k, language: LANG_NAMES[k] ?? k, name, meaning });
	}
	return out;
}
