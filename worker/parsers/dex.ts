/**
 * Parser for "List of Pokémon by National Pokédex number".
 * Rows look like:
 *   {{ndex|0025|Pikachu|Electric}}
 *   {{ndex|0019|Rattata|Normal|forms=2}}
 *   {{ndex|0669|Flabébé|formname=Red Flower|Fairy|forms=5}}
 *   {{ndex/form|0019|Rattata|-Alola|Alolan Form|Dark|Normal}}
 * grouped under `===[[Generation N]]===` headings.
 */
import { romanToInt, splitTopLevel } from "../wikitext/templates.ts";

export interface DexRow {
	/** National Pokédex number; null for unreleased entries listed as "????". */
	national_dex: number | null;
	name: string;
	types: string[];
	generation: number | null;
	/** Present only for alternate-form rows (regional forms etc.). */
	form?: string;
	/** Bulbapedia's form suffix, e.g. "-Alola". Present only for form rows. */
	form_suffix?: string;
}

export interface DexIndex {
	/** Base species rows in National Dex order. */
	species: DexRow[];
	/** Alternate-form rows in document order. */
	forms: DexRow[];
}

function parseRow(inner: string): { positional: string[]; named: Record<string, string> } {
	const parts = splitTopLevel(inner);
	const positional: string[] = [];
	const named: Record<string, string> = {};
	for (const part of parts) {
		const m = /^\s*([^=]+?)\s*=([\s\S]*)$/.exec(part);
		if (m) named[m[1]] = m[2].trim();
		else positional.push(part.trim());
	}
	return { positional, named };
}

function parseNumber(s: string): number | null {
	return /^\d+$/.test(s) ? Number.parseInt(s, 10) : null;
}

export function parseDexList(wikitext: string): DexIndex {
	const species: DexRow[] = [];
	const forms: DexRow[] = [];
	let generation: number | null = null;
	// Some rows end with HTML comments ("<!--Purely gender models-->"); drop them first.
	const stripped = wikitext.replace(/<!--[\s\S]*?-->/g, "");
	for (const line of stripped.split("\n")) {
		const h = /^=+\s*\[\[Generation ([IVXLC]+)\]\]\s*=+/.exec(line);
		if (h) {
			generation = romanToInt(h[1]);
			continue;
		}
		let m = /^\{\{ndex\|(.*)\}\}\s*$/.exec(line);
		if (m) {
			const { positional } = parseRow(m[1]);
			const [num, name, ...types] = positional;
			if (!name) continue;
			species.push({ national_dex: parseNumber(num), name, types: types.filter(Boolean), generation });
			continue;
		}
		m = /^\{\{ndex\/form\|(.*)\}\}\s*$/.exec(line);
		if (m) {
			const { positional } = parseRow(m[1]);
			const [num, name, suffix, form, ...types] = positional;
			if (!name) continue;
			forms.push({ national_dex: parseNumber(num), name, types: types.filter(Boolean), generation, form: form || suffix, form_suffix: suffix });
		}
	}
	return { species, forms };
}
