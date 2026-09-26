/** Shared helpers for "row template" tables: {{Something/entry|a|b|c}} repeated many times. */
import { findAllTemplates, parseTemplateParams, type TemplateParams } from "../wikitext/templates.ts";
import { cleanInline } from "../wikitext/clean.ts";

export interface Row extends TemplateParams {
	name: string;
	start: number;
	end: number;
}

/** Every template matching `matcher`, parsed into params, in document order. */
export function rows(wikitext: string, matcher: string | ((name: string) => boolean)): Row[] {
	return findAllTemplates(wikitext, matcher).map((m) => ({ name: m.name, start: m.start, end: m.end, ...parseTemplateParams(m.body) }));
}

/** Case-insensitive prefix matcher for template names. */
export function prefix(p: string): (name: string) => boolean {
	const lp = p.toLowerCase();
	return (name) => name.toLowerCase().startsWith(lp);
}

/** Named params of a template, each cleaned to plain text; empty values dropped. */
export function cleanedNamed(t: TemplateParams | null | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!t) return out;
	for (const [k, v] of Object.entries(t.named)) {
		const c = cleanInline(v);
		if (c) out[k] = c;
	}
	return out;
}

/** Extract game abbreviations from text like `{{gameabbrev1|RGB}}{{gameabbrevss|Stad}}` → ["RGB", "Stad"]. */
export function gameAbbrevs(text: string): string[] {
	return [...text.matchAll(/\{\{(?:gameabbrev\w*|game|sup\/\w+|g|v|v2)\|([^|}]+)(?:\|[^}]*)?\}\}/gi)].map((m) => m[1].trim());
}

/** A numeric cell like "90", "—", "", "26{{sup/1|Y}}" → number or null. */
export function numCell(v: string | undefined): number | null {
	if (v === undefined) return null;
	const c = cleanInline(v).replace(/,/g, "");
	const m = /^\s*(\d+)/.exec(c);
	return m ? Number.parseInt(m[1], 10) : null;
}

const DAMAGE_CATEGORIES = new Set(["physical", "special", "status"]);
export function isDamageCategory(v: string | undefined): boolean {
	return !!v && DAMAGE_CATEGORIES.has(cleanInline(v).toLowerCase());
}

/** Split a section's wikitext by its sub-headings, returning [{heading, level, text}] with the preamble first. */
export function splitByHeadings(wikitext: string): { heading: string; level: number; text: string }[] {
	const out: { heading: string; level: number; text: string }[] = [];
	const re = /^(=+)\s*(.*?)\s*\1\s*$/gm;
	let last = 0;
	let cur = { heading: "", level: 0 };
	let m: RegExpExecArray | null;
	while ((m = re.exec(wikitext))) {
		out.push({ ...cur, text: wikitext.slice(last, m.index) });
		cur = { heading: cleanInline(m[2]), level: m[1].length };
		last = m.index + m[0].length;
	}
	out.push({ ...cur, text: wikitext.slice(last) });
	return out;
}

/** Plain text of the first section with `heading` (case-insensitive), including its sub-sections. */
export function sectionText(wikitext: string, heading: string): string | null {
	const blocks = splitByHeadings(wikitext);
	const want = heading.toLowerCase();
	const i = blocks.findIndex((b) => b.heading.toLowerCase() === want);
	if (i === -1) return null;
	const level = blocks[i].level;
	let text = blocks[i].text;
	for (let j = i + 1; j < blocks.length && blocks[j].level > level; j++) {
		text += `\n${"=".repeat(blocks[j].level)} ${blocks[j].heading} ${"=".repeat(blocks[j].level)}\n${blocks[j].text}`;
	}
	return text;
}

/** Bulleted lines of a wikitext block, cleaned. */
export function bulletItems(text: string): string[] {
	return text
		.split("\n")
		.filter((l) => /^\*+\s*/.test(l))
		.map((l) => cleanInline(l.replace(/^\*+\s*/, "")))
		.filter(Boolean);
}

/** Zero-pad a dex number to 4 digits ("0025") as Bulbapedia file names use. */
export function pad4(n: number): string {
	return String(n).padStart(4, "0");
}
