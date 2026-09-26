/**
 * Turn Bulbapedia wikitext into readable plain text for an LLM.
 * This is intentionally lossy: links become their display text, common inline templates
 * ({{p|Pikachu}}, {{m|Thunderbolt}}, {{tt|shown|tooltip}}) become their visible text, and
 * layout-only constructs (files, tables, references, comments, notices) are dropped.
 */
import { findClosing, splitTopLevel } from "./templates.ts";

/** Templates whose visible text is their FIRST positional parameter. */
const FIRST_PARAM = new Set(["tt", "obp", "wp", "sup", "tc", "sc", "small", "nowrap", "lang"]);

/**
 * Inline link-style templates whose visible text is their LAST positional parameter
 * ({{p|Pikachu}}, {{m|Thunderbolt|display}}, {{a|Static}}, {{status|Paralysis|paralyzing}}).
 */
const LAST_PARAM = new Set(
	[
		"p", "m", "a", "i", "an", "ap", "mp", "pkmn", "type", "type2", "status", "cat", "dl", "bp", "gl", "ga", "game",
		"game2", "game3", "adv", "ev", "eo", "ma", "mo", "tcg", "tcg id", "pw", "ba", "bmp", "v", "v2", "vt", "wpl",
		"color2", "colour2", "player", "rival", "pokémon", "pokemon", "berry", "item", "loc", "rt", "rtn",
		"tr", "tm", "hm", "evo", "5v", "5v2", "chan", "rr", "abbrev", "abbrev2", "t", "typecolor", "msp", "msp/h", "msp/3", "msp/6",
	].map((s) => s.toLowerCase()),
);

/** Editorial notices, layout templates, navboxes and icon-only templates that must never leak into prose. */
const DROP = new Set([
	"abilityresearch", "moveresearch", "itemresearch", "research", "incomplete", "cleanup", "stub", "main",
	"see also", "seealso", "clear", "-", "clr", "anchor", "reflist", "references", "spoilers", "bulbanews",
	"project tag", "project pokédex notice", "project moves and abilities notice", "project itemdex notice",
	"pokédex", "movedex", "abilitydex", "itemdex", "evobox", "evobox/2", "evobox/3", "evobox/4", "availability/entry",
	"catch/entry", "catch/header", "catch/footer", "learnlist/levelh", "learnlist/levelf", "learnlist/level",
	"learnlist/tmh", "learnlist/tmf", "learnlist/tm", "learnlist/breedh", "learnlist/breedf", "learnlist/breed",
	"stats", "stats/pe", "typeeffectiveness", "basestats", "pokémon infobox", "moveinfobox", "abilityinfobox/header",
	"abilityinfobox/desc", "iteminfobox", "ndex", "ndexh", "ndex/form",
	"kanto", "johto", "hoenn", "sinnoh", "unova", "kalos", "alola", "galar", "paldea", "hisui", "abilities", "types", "tera",
	"flexheader", "flexfooter", "yes", "no", "fact", "spoilers", "search", "redirect", "samename", "confused", "split", "left clear",
	"bag", "bag/s", "bag/f", "bag2", "bag3", "ms", "gameicon", "typeicon", "e",
]);

/** Render one template (name + params, no nested templates left) as plain text. */
function templateToText(inner: string): string {
	const parts = splitTopLevel(inner);
	const name = (parts[0] ?? "").trim();
	const lname = name.toLowerCase();
	if (lname.startsWith("#")) return ""; // parser functions: #switch, #expr, #if...
	if (DROP.has(lname) || /^(pokémonprevnext|moveprevnext|abilityprevnext|itemprevnext|prevnext)/.test(lname)) return "";
	const positional = parts
		.slice(1)
		.filter((p) => !/^\s*[^=|{}[\]]+=/.test(p))
		.map((p) => p.trim());
	if (lname === "gen") return positional[0] ? `Generation ${positional[0]}` : "";
	if (lname === "stat") return positional[0] ?? "";
	if (lname === "color" || lname === "colour") return positional[1] ?? "";
	if (FIRST_PARAM.has(lname)) return positional[0] ?? "";
	// Version superscripts: 26{{sup/1|Y}} -> "26 (Y)"
	if (lname.startsWith("sup/")) return positional.length ? ` (${positional[positional.length - 1]})` : "";
	if (LAST_PARAM.has(lname)) return positional.length ? positional[positional.length - 1] : "";
	// Zero-argument name templates ({{Ash}}, {{Gary}}, {{Delia}}) render as the name itself.
	if (parts.length === 1 && /^[A-Z][a-z]+$/.test(name)) return name;
	// Unknown template with one or two short plain positional args and nothing else: probably an inline
	// link wrapper. Otherwise treat as layout/data and drop.
	const named = parts.slice(1).length - positional.length;
	const last = positional[positional.length - 1] ?? "";
	const looksInline = last.length > 0 && last.length <= 60 && !last.includes("\n") && !/^\d+$/.test(last);
	if (named === 0 && positional.length >= 1 && positional.length <= 2 && looksInline) return last;
	return "";
}

/** Remove `[[File:...]]` / `[[Image:...]]` blocks, which may contain nested brackets in captions. */
function stripFiles(text: string): string {
	let out = "";
	let i = 0;
	while (i < text.length) {
		if (/^\[\[(File|Image|Media):/i.test(text.slice(i, i + 10))) {
			let depth = 0;
			let j = i;
			while (j < text.length) {
				if (text.startsWith("[[", j)) {
					depth++;
					j += 2;
				} else if (text.startsWith("]]", j)) {
					depth--;
					j += 2;
					if (depth === 0) break;
				} else {
					j++;
				}
			}
			i = j;
		} else {
			out += text[i];
			i++;
		}
	}
	return out;
}

/** Remove wikitable blocks `{| ... |}` (innermost first for nested tables). */
function stripTables(text: string): string {
	let prev: string;
	let cur = text;
	do {
		prev = cur;
		cur = cur.replace(/\{\|(?:(?!\{\|)[\s\S])*?\|\}/g, "");
	} while (cur !== prev);
	return cur.replace(/^\|\}\s*$/gm, "");
}

/** Replace every template with its plain-text rendering, innermost first. */
function renderTemplates(text: string): string {
	let cur = text;
	for (let guard = 0; guard < 50; guard++) {
		const idx = cur.indexOf("{{");
		if (idx === -1) break;
		let changed = false;
		cur = cur.replace(/\{\{([^{}]*)\}\}/g, (_m, inner: string) => {
			changed = true;
			return templateToText(inner);
		});
		if (!changed) {
			const end = findClosing(cur, idx);
			cur = end === -1 ? cur.slice(0, idx) : cur.slice(0, idx) + cur.slice(end);
		}
	}
	return cur;
}

export interface CleanOptions {
	/** Render `== Heading ==` as markdown-style `## Heading` (default true). */
	headings?: boolean;
}

export function cleanWikitext(wikitext: string, opts: CleanOptions = {}): string {
	const headings = opts.headings ?? true;
	let t = wikitext;
	t = t.replace(/<!--[\s\S]*?-->/g, "");
	t = t.replace(/<ref[^>]*\/>/gi, "");
	t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
	t = t.replace(/<(noinclude|includeonly)>[\s\S]*?<\/\1>/gi, "");
	t = t.replace(/<gallery[^>]*>[\s\S]*?<\/gallery>/gi, "");
	t = stripTables(t);
	t = stripFiles(t);
	t = renderTemplates(t);
	t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2");
	t = t.replace(/\[\[([^\]#|]*)(?:#[^\]|]*)?\]\]/g, "$1");
	t = t.replace(/\[(?:https?:)?\/\/[^\s\]]+\s+([^\]]*)\]/g, "$1");
	t = t.replace(/\[(?:https?:)?\/\/[^\s\]]+\]/g, "");
	t = t.replace(/<br\s*\/?>/gi, "\n");
	t = t.replace(/<[^>]+>/g, "");
	t = t.replace(/'''''|'''|''/g, "");
	t = t
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&rarr;/g, "→")
		.replace(/&mdash;/g, "—")
		.replace(/&ndash;/g, "–");
	t = t.replace(/^(=+)\s*(.*?)\s*\1\s*$/gm, (_m, eq: string, title: string) =>
		headings ? `\n${"#".repeat(Math.min(6, eq.length))} ${title.trim()}\n` : `\n${title.trim()}\n`,
	);
	t = t.replace(/^:+\s*/gm, "");
	t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	return t;
}

/** Inline-only cleaning for infobox values: templates and links resolved, no heading handling. */
export function cleanInline(value: string | undefined): string {
	if (!value) return "";
	return cleanWikitext(value, { headings: false }).replace(/\s+/g, " ").trim();
}

/** Parse an integer out of a wikitext value like "0025", "112<!--105 in Gen V-->", "1,000,000". */
export function parseIntLoose(value: string | undefined): number | null {
	const c = cleanInline(value).replace(/,/g, "");
	const m = /-?\d+/.exec(c);
	return m ? Number.parseInt(m[0], 10) : null;
}

export function parseFloatLoose(value: string | undefined): number | null {
	const c = cleanInline(value).replace(/,/g, "");
	const m = /-?\d+(?:\.\d+)?/.exec(c);
	return m ? Number.parseFloat(m[0]) : null;
}

/** Strip HTML tags from a CirrusSearch snippet and decode entities. */
export function stripHtml(html: string): string {
	return html
		.replace(/<[^>]+>/g, "")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}
