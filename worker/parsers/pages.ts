/** Parsers for non-species page types: items, locations, types, episodes, characters, TCG cards, games. */
import { cleanInline, cleanWikitext } from "../wikitext/clean.ts";
import { findAllTemplates, parseTemplate, romanToInt } from "../wikitext/templates.ts";
import { bulletItems, cleanedNamed, gameAbbrevs, numCell, prefix, rows, sectionText, splitByHeadings } from "./rows.ts";
import { parseMoveDescriptions } from "./move-extra.ts";

const CAP = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}\n\n[truncated: ${s.length - n} more characters]` : s) : null);

function cleanSection(wikitext: string, heading: string, max = 4000): string | null {
	const t = sectionText(wikitext, heading);
	return t ? CAP(cleanWikitext(t).trim(), max) : null;
}

/** Wikitext of the lead with every block template removed, cleaned (the intro prose). */
function introText(wikitext: string, max = 2500): string | null {
	let text = wikitext;
	for (const t of findAllTemplates(wikitext, () => true).reverse()) {
		const lineStart = t.start === 0 || wikitext[t.start - 1] === "\n";
		const multiline = wikitext.slice(t.start, t.end).includes("\n");
		if (lineStart && (multiline || /^\{\{(redirect|search|samename|confused|split|spoilers|main|StrategyWiki)/i.test(wikitext.slice(t.start)))) {
			text = text.slice(0, t.start) + text.slice(t.end);
		}
	}
	const firstHeading = text.search(/^=+/m);
	const cleaned = cleanWikitext(firstHeading === -1 ? text : text.slice(0, firstHeading)).replace(/^\|\}\s*$/gm, "").trim();
	return CAP(cleaned, max);
}

// ---------------------------------------------------------------- Item

export interface ItemInfo {
	name: string;
	japanese_name: string | null;
	japanese_translation: string | null;
	generation: number | null;
	fling_power: number | null;
	bag_pockets: { generation: number | null; pocket: string }[];
	prices: { games: string[]; buy: number | null; sell: number | null }[];
	descriptions: { games: string[]; text: string }[];
	effect: string | null;
	acquisition: string | null;
	raw_params: Record<string, string>;
}

export function parseItem(wikitext: string): ItemInfo | null {
	const head = parseTemplate(wikitext, "ItemInfobox/head") ?? parseTemplate(wikitext, "ItemInfobox");
	if (!head) return null;
	const n = cleanedNamed(head);
	const fling = rows(wikitext, "ItemInfobox/Fling")[0];
	const prices = rows(wikitext, "ItemPrice").map((r) => ({
		games: gameAbbrevs(r.positional[0] ?? ""),
		buy: numCell((r.positional[1] ?? "").replace(/\{\{PDollar\}\}/gi, "")),
		sell: numCell((r.positional[2] ?? "").replace(/\{\{PDollar\}\}/gi, "")),
	}));
	const { name, jname, jtrans, gen, size, colorscheme, fling: _f, ...rest } = n;
	return {
		name: name ?? "",
		japanese_name: jname ?? null,
		japanese_translation: jtrans ?? null,
		generation: gen ? romanToInt(gen) : null,
		fling_power: fling ? numCell(fling.positional[0]) : null,
		bag_pockets: rows(wikitext, prefix("ItemInfobox/BagRow")).map((r) => ({ generation: romanToInt(cleanInline(r.positional[0])), pocket: cleanInline(r.positional[1]) })),
		prices,
		descriptions: parseMoveDescriptions(wikitext),
		effect: cleanSection(wikitext, "Effect"),
		acquisition: cleanSection(wikitext, "Acquisition") ?? cleanSection(wikitext, "Locations") ?? cleanSection(wikitext, "Distribution"),
		raw_params: rest,
	};
}

// ---------------------------------------------------------------- Location

export interface Encounter {
	section: string;
	national_dex: number | null;
	name: string;
	version_flags: string[];
	method: string | null;
	levels: string | null;
	rates: string[];
}
export interface GroundItem {
	item: string;
	description: string;
	games: string[];
}
export interface TrainerEntry {
	section: string;
	class: string;
	name: string | null;
	pokemon: { name: string; level: number | null; national_dex: number | null }[];
}
export interface LocationInfo {
	name: string;
	japanese_name: string | null;
	region: string | null;
	kind: string | null;
	map_description: string | null;
	generation: number | null;
	connections: Record<string, string>;
	intro: string | null;
	encounters: Encounter[];
	items: GroundItem[];
	trainers: TrainerEntry[];
	raw_params: Record<string, string>;
}

const INFOBOX_NAMES = ["Infobox location", "Town infobox", "Route infobox", "City infobox", "Location infobox", "Infobox route"];

export function parseLocation(wikitext: string): LocationInfo | null {
	let box: ReturnType<typeof parseTemplate> = null;
	for (const n of INFOBOX_NAMES) {
		box = parseTemplate(wikitext, n);
		if (box) break;
	}
	if (!box) return null;
	const n = cleanedNamed(box);
	const connections: Record<string, string> = {};
	for (const dir of ["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"]) if (n[dir]) connections[dir] = n[dir];

	const encounters: Encounter[] = [];
	const trainers: TrainerEntry[] = [];
	const path: string[] = [];
	for (const block of splitByHeadings(wikitext)) {
		if (block.heading) {
			path.splice(block.level - 2);
			path[block.level - 2] = block.heading;
		}
		const section = path.filter(Boolean).join(" > ");
		for (const r of rows(block.text, prefix("catch/entry"))) {
			const p = r.positional.map((x) => cleanInline(x));
			let i = 2;
			const flags: string[] = [];
			while (i < p.length && /^(yes|no)$/i.test(p[i])) flags.push(p[i++]);
			encounters.push({ section, national_dex: numCell(p[0]), name: p[1], version_flags: flags, method: p[i] || null, levels: p[i + 1] || null, rates: p.slice(i + 2).filter(Boolean) });
		}
		for (const r of rows(block.text, (nm) => /^trainerentry(\/master)?$/i.test(nm))) {
			const p = r.positional.map((x) => cleanInline(x));
			const master = /master/i.test(r.name);
			const pokemon: TrainerEntry["pokemon"] = [];
			if (master) {
				pokemon.push({ national_dex: numCell(p[3]), name: p[4], level: numCell(p[6]) });
			} else {
				for (let i = 5; i + 3 < p.length; i += 5) {
					if (!p[i + 1]) continue;
					pokemon.push({ national_dex: numCell(p[i]), name: p[i + 1], level: numCell(p[i + 3]) });
				}
			}
			trainers.push({ section, class: p[1], name: p[2] || null, pokemon });
		}
	}
	const items: GroundItem[] = rows(wikitext, (nm) => /^itemlist$/i.test(nm)).map((r) => ({
		item: cleanInline(r.positional[0]),
		description: cleanInline(r.positional[1]),
		games: Object.entries(r.named).filter(([, v]) => v.trim().toLowerCase() === "yes").map(([k]) => k),
	}));

	const { location_name, name, japanese_name, jpname, jptrans, translated_name, region, type, mapdesc, generation, image, ...rest } = n;
	for (const k of Object.keys(rest)) if (/^image|^size|^map|color/i.test(k) || k in connections) delete rest[k];
	return {
		name: location_name ?? name ?? "",
		japanese_name: japanese_name ?? jpname ?? null,
		region: region ?? null,
		kind: type ?? null,
		map_description: mapdesc ?? null,
		generation: generation ? (romanToInt(generation) ?? numCell(generation)) : null,
		connections,
		intro: introText(wikitext),
		encounters,
		items,
		trainers,
		raw_params: rest,
	};
}

// ---------------------------------------------------------------- Type

export interface TypeInfo {
	type: string;
	offensive: { super_effective: string[]; not_very_effective: string[]; no_effect: string[] };
	defensive: { weak_to: string[]; resists: string[]; immune_to: string[] };
	average_base_stats: Record<string, number> | null;
	pokemon: Record<string, { national_dex: number | null; name: string }[]>;
	moves: { generation: number | null; move: string; category: string | null; power: number | null; accuracy: number | null; pp: number | null; target: string | null; description: string }[];
	abilities: string[];
	battle_properties: string | null;
}

function icons(v: string | undefined): string[] {
	return [...(v ?? "").matchAll(/\{\{TypeIcon\|([^}|]+)/g)].map((m) => m[1].trim());
}

export function parseTypePage(wikitext: string): TypeInfo | null {
	const props = rows(wikitext, "TypeProperties");
	if (!props.length) return null;
	const off = props.find((p) => /off/i.test(p.named.prop ?? "")) ?? props[0];
	const def = props.find((p) => /def/i.test(p.named.prop ?? "")) ?? props[1];
	const stats = parseTemplate(wikitext, "BaseStatNoCat");
	const average: Record<string, number> | null = stats
		? Object.fromEntries(Object.entries(stats.named).filter(([k]) => k !== "type").map(([k, v]) => [k, Number.parseFloat(v)]))
		: null;
	const pokemon: TypeInfo["pokemon"] = {};
	for (const block of splitByHeadings(sectionText(wikitext, "Pokémon") ?? "")) {
		const list = rows(block.text, "ArtP").map((r) => ({ national_dex: numCell(r.positional[0]), name: cleanInline(r.positional[1]) }));
		if (list.length && block.heading) pokemon[block.heading] = list;
	}
	const moves = rows(wikitext, (n) => /^movelist\/battle$/i.test(n)).map((r) => {
		const p = r.positional;
		return {
			generation: numCell(p[0]),
			move: cleanInline(p[1]),
			category: cleanInline(p[2]) || null,
			power: numCell(p[4]),
			accuracy: numCell(p[5]),
			pp: numCell(p[6]),
			target: cleanInline(p[7]) || null,
			description: cleanInline(p[8]),
		};
	});
	return {
		type: cleanInline(off.named.type ?? ""),
		offensive: { super_effective: icons(off.named.se), not_very_effective: icons(off.named.nve), no_effect: icons(off.named.immune) },
		defensive: def ? { weak_to: icons(def.named.se), resists: icons(def.named.nve), immune_to: icons(def.named.immune) } : { weak_to: [], resists: [], immune_to: [] },
		average_base_stats: average,
		pokemon,
		moves,
		abilities: [...new Set(rows(wikitext, "acolor").map((r) => cleanInline(r.positional[0])).filter(Boolean))],
		battle_properties: cleanSection(wikitext, "Battle properties", 3000),
	};
}

// ---------------------------------------------------------------- Episode

export interface EpisodeInfo {
	code: string;
	title_en: string | null;
	title_ja: string | null;
	title_ja_translation: string | null;
	broadcast_jp: string | null;
	broadcast_us: string | null;
	series: string | null;
	opening_en: string | null;
	opening_ja: string | null;
	ending_ja: string | null;
	previous: string | null;
	next: string | null;
	blurb: string | null;
	plot: string | null;
	major_events: string[];
	characters: { humans: string[]; pokemon: string[] };
	raw_params: Record<string, string>;
}

export function parseEpisode(wikitext: string): EpisodeInfo | null {
	const box = parseTemplate(wikitext, "EpisodeInfobox");
	if (!box) return null;
	const n = cleanedNamed(box);
	const nav = cleanedNamed(parseTemplate(wikitext, "EpicodePrevNext"));
	const chars = sectionText(wikitext, "Characters") ?? "";
	const humans = bulletItems(sectionText(chars, "Humans") ?? "");
	const pokemon = bulletItems(sectionText(chars, "Pokémon") ?? "");
	const { epcode, title_en, title_ja, title_ja_trans, broadcast_jp, broadcast_us, en_series, en_op, ja_op, ja_ed, colorscheme, screen, footnotes, ...rest } = n;
	return {
		code: epcode ?? "",
		title_en: title_en ?? null,
		title_ja: title_ja ?? null,
		title_ja_translation: title_ja_trans ?? null,
		broadcast_jp: broadcast_jp ?? null,
		broadcast_us: broadcast_us ?? null,
		series: en_series ?? null,
		opening_en: en_op ?? null,
		opening_ja: ja_op ?? null,
		ending_ja: ja_ed ?? null,
		previous: nav.prevcode && nav.prevcode !== "None" ? `${nav.prevcode}: ${nav.prevtitle ?? ""}`.trim() : null,
		next: nav.nextcode && nav.nextcode !== "None" ? `${nav.nextcode}: ${nav.nexttitle ?? ""}`.trim() : null,
		blurb: cleanSection(wikitext, "Blurb", 2000),
		plot: cleanSection(wikitext, "Plot", 8000),
		major_events: bulletItems(sectionText(wikitext, "Major events") ?? ""),
		characters: { humans, pokemon },
		raw_params: rest,
	};
}

// ---------------------------------------------------------------- Character

export interface CharacterInfo {
	name: string;
	japanese_name: string | null;
	romanized_name: string | null;
	profile: Record<string, string>;
	anime: Record<string, string> | null;
	games: Record<string, string> | null;
	manga: Record<string, string> | null;
	teams: { member: string; rank: string | null }[];
	intro: string | null;
}

const COLOR_KEYS = /^(color|bordercolor|corecolor|size|image|caption)$/;

export function parseCharacter(wikitext: string): CharacterInfo | null {
	const box = parseTemplate(wikitext, "Character Infobox");
	if (!box) return null;
	const strip = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([k]) => !COLOR_KEYS.test(k)));
	const n = strip(cleanedNamed(box));
	const sub = (name: string) => {
		const t = parseTemplate(wikitext, name);
		return t ? strip(cleanedNamed(t)) : null;
	};
	const { name, jname, tmname, ...profile } = n;
	return {
		name: name ?? "",
		japanese_name: jname ?? null,
		romanized_name: tmname ?? null,
		profile,
		anime: sub("Character Infobox/Anime"),
		games: sub("Character Infobox/Game"),
		manga: sub("Character Infobox/Manga"),
		teams: rows(wikitext, "Character Infobox/Team").map((r) => ({ member: cleanInline(r.named.member ?? ""), rank: cleanInline(r.named.rank ?? "") || null })),
		intro: introText(wikitext),
	};
}

// ---------------------------------------------------------------- TCG card

export interface TcgCardInfo {
	name: string;
	japanese_name: string | null;
	image: string | null;
	card: Record<string, string>;
	prints: Record<string, string>[];
	attacks: { name: string; japanese_name: string | null; cost: string[]; damage: string | null; effect: string | null }[];
	pokedex: Record<string, string> | null;
	card_text: string | null;
}

export function parseTcgCard(wikitext: string): TcgCardInfo | null {
	const box = parseTemplate(wikitext, "PokémoncardInfobox");
	if (!box) return null;
	const n = cleanedNamed(box);
	const { cardname, jname, ...card } = n;
	for (const k of Object.keys(card)) if (/^(image|reprint\d*|recaption\d*|caption)$/.test(k)) delete card[k];
	const attacks = rows(wikitext, "Cardtext/Attack").map((r) => ({
		name: cleanInline(r.named.name ?? ""),
		japanese_name: cleanInline(r.named.jname ?? "") || null,
		cost: [...(r.named.cost ?? "").matchAll(/\{\{e\|([^}|]+)/g)].map((m) => m[1]),
		damage: cleanInline(r.named.damage ?? "") || null,
		effect: cleanInline(r.named.effect ?? "") || null,
	}));
	const dex = parseTemplate(wikitext, "Carddex");
	return {
		name: cardname ?? "",
		japanese_name: jname ?? null,
		image: n.image ?? null,
		card,
		prints: rows(wikitext, "PokémoncardInfobox/Expansion").map((r) => cleanedNamed(r)),
		attacks,
		pokedex: dex ? cleanedNamed(dex) : null,
		card_text: cleanSection(wikitext, "Card text", 3000),
	};
}

// ---------------------------------------------------------------- Game

export interface GameInfo {
	name: string;
	name2: string | null;
	platform: string | null;
	category: string | null;
	developer: string | null;
	publisher: string | null;
	generation: string | null;
	release_dates: Record<string, string>;
	ratings: Record<string, string>;
	intro: string | null;
	raw_params: Record<string, string>;
}

export function parseGame(wikitext: string): GameInfo | null {
	const box = parseTemplate(wikitext, "Infobox game");
	if (!box) return null;
	const n = cleanedNamed(box);
	const release_dates: Record<string, string> = {};
	const ratings: Record<string, string> = {};
	const rest: Record<string, string> = {};
	for (const [k, v] of Object.entries(n)) {
		const rd = /^release_date_(\w+)$/.exec(k);
		if (rd) release_dates[rd[1]] = v;
		else if (/^(cero|esrb|acb|oflc|pegi|grb|usk|class_ind)$/.test(k)) ratings[k] = v;
		else if (!/^(name|name2|boxart\d*|caption\d*|colorscheme|bordercolorscheme|platform|category|developer|publisher|gen_series)$/.test(k)) rest[k] = v;
	}
	return {
		name: n.name ?? "",
		name2: n.name2 ?? null,
		platform: n.platform ?? null,
		category: n.category ?? null,
		developer: n.developer ?? null,
		publisher: n.publisher ?? null,
		generation: n.gen_series ?? null,
		release_dates,
		ratings,
		intro: introText(wikitext),
		raw_params: rest,
	};
}
