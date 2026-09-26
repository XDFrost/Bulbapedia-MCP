/**
 * Depth-aware helpers for pulling MediaWiki templates ({{Name|a|k=v}}) out of wikitext.
 * Infobox values frequently contain nested templates ({{tt|..}}, {{#switch:..}}), so a
 * naive regex is not enough; these walk braces with a depth counter.
 */

export interface TemplateMatch {
	/** Template name as written (trimmed). */
	name: string;
	/** Offset of the opening `{{`. */
	start: number;
	/** Offset just past the closing `}}`. */
	end: number;
	/** Text between the name and the closing braces, including the leading `|` if present. */
	body: string;
}

/** True if the template name ends at `pos`. Names may contain spaces ("Pokémon Infobox"). */
function nameEndsAt(text: string, pos: number): boolean {
	if (pos >= text.length) return false;
	const c = text[pos];
	return c === "|" || c === "}" || c === "\n";
}

/**
 * Find the next template whose name matches `matcher`, starting at `from`.
 * `matcher` may be an exact string (case-sensitive) or a predicate over the name.
 */
export function findTemplate(text: string, matcher: string | ((name: string) => boolean), from = 0): TemplateMatch | null {
	const matches = typeof matcher === "string" ? (n: string) => n === matcher : matcher;
	let i = text.indexOf("{{", from);
	while (i !== -1) {
		let j = i + 2;
		while (j < text.length && !nameEndsAt(text, j)) j++;
		const name = text.slice(i + 2, j).trim();
		let k = j;
		while (k < text.length && (text[k] === " " || text[k] === "\t" || text[k] === "\n")) k++;
		if (name && matches(name) && (text.startsWith("|", k) || text.startsWith("}}", k))) {
			const end = findClosing(text, i);
			if (end === -1) return null;
			return { name, start: i, end, body: text.slice(k, end - 2) };
		}
		i = text.indexOf("{{", i + 2);
	}
	return null;
}

/** Given the index of an opening `{{`, return the offset just past its matching `}}` (or -1). */
export function findClosing(text: string, open: number): number {
	let depth = 0;
	let i = open;
	while (i < text.length) {
		if (text.startsWith("{{", i)) {
			depth++;
			i += 2;
		} else if (text.startsWith("}}", i)) {
			depth--;
			i += 2;
			if (depth === 0) return i;
		} else {
			i++;
		}
	}
	return -1;
}

/** All templates matching `matcher`, in document order (non-overlapping, outermost only). */
export function findAllTemplates(text: string, matcher: string | ((name: string) => boolean)): TemplateMatch[] {
	const out: TemplateMatch[] = [];
	let from = 0;
	for (;;) {
		const m = findTemplate(text, matcher, from);
		if (!m) break;
		out.push(m);
		from = m.end;
	}
	return out;
}

export interface TemplateParams {
	/** Named parameters, keys trimmed. */
	named: Record<string, string>;
	/** Positional parameters in order (1-based in wikitext, 0-based here). */
	positional: string[];
}

/** Split `body` on top-level `|`, respecting nested `{{ }}` and `[[ ]]`. */
export function splitTopLevel(body: string, sep = "|"): string[] {
	const parts: string[] = [];
	let depthBraces = 0;
	let depthBrackets = 0;
	let cur = "";
	let i = 0;
	while (i < body.length) {
		if (body.startsWith("{{", i)) {
			depthBraces++;
			cur += "{{";
			i += 2;
		} else if (body.startsWith("}}", i)) {
			depthBraces = Math.max(0, depthBraces - 1);
			cur += "}}";
			i += 2;
		} else if (body.startsWith("[[", i)) {
			depthBrackets++;
			cur += "[[";
			i += 2;
		} else if (body.startsWith("]]", i)) {
			depthBrackets = Math.max(0, depthBrackets - 1);
			cur += "]]";
			i += 2;
		} else if (body[i] === sep && depthBraces === 0 && depthBrackets === 0) {
			parts.push(cur);
			cur = "";
			i++;
		} else {
			cur += body[i];
			i++;
		}
	}
	parts.push(cur);
	return parts;
}

/** Parse a template body (the part after the name) into named and positional params. */
export function parseTemplateParams(body: string): TemplateParams {
	const named: Record<string, string> = {};
	const positional: string[] = [];
	const trimmed = body.startsWith("|") ? body.slice(1) : body;
	if (trimmed.trim() === "") return { named, positional };
	for (const raw of splitTopLevel(trimmed)) {
		const m = /^\s*([^=|{}[\]<>]+?)\s*=([\s\S]*)$/.exec(raw);
		if (m) named[m[1]] = m[2].trim();
		else positional.push(raw.trim());
	}
	return { named, positional };
}

/** Convenience: find a template by name and return its parsed params (or null). */
export function parseTemplate(text: string, name: string): TemplateParams | null {
	const m = findTemplate(text, name);
	return m ? parseTemplateParams(m.body) : null;
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

/** Convert a Roman numeral (I..XX) to an integer; returns null if not a numeral. */
export function romanToInt(s: string): number | null {
	const str = s.trim().toUpperCase();
	if (!str || !/^[IVXLC]+$/.test(str)) return null;
	let total = 0;
	for (let i = 0; i < str.length; i++) {
		const v = ROMAN[str[i]];
		const next = ROMAN[str[i + 1]] ?? 0;
		total += v < next ? -v : v;
	}
	return total;
}

const ROMAN_TABLE: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

export function intToRoman(n: number): string {
	let out = "";
	let rest = n;
	for (const [v, s] of ROMAN_TABLE) {
		while (rest >= v) {
			out += s;
			rest -= v;
		}
	}
	return out;
}
