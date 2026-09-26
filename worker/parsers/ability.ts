import { findAllTemplates, parseTemplate, parseTemplateParams, romanToInt } from "../wikitext/templates.ts";
import { cleanInline } from "../wikitext/clean.ts";

export interface AbilityInfo {
	name: string;
	japanese_name: string | null;
	japanese_translation: string | null;
	generation: number | null;
	/** In-game descriptions per generation ("III".."IX", or "Champions"). */
	descriptions: { generation: string; text: string }[];
	raw_params: Record<string, string>;
}

export function parseAbilityInfobox(wikitext: string): AbilityInfo | null {
	const t = parseTemplate(wikitext, "AbilityInfobox/header");
	if (!t) return null;
	const p = t.named;
	const get = (k: string) => (p[k] !== undefined ? cleanInline(p[k]) : "");

	const descriptions: { generation: string; text: string }[] = [];
	for (const m of findAllTemplates(wikitext, (n) => n.startsWith("AbilityInfobox/desc"))) {
		const params = parseTemplateParams(m.body);
		if (m.name === "AbilityInfobox/desc") {
			const gen = cleanInline(params.positional[0]);
			const text = cleanInline(params.positional[1]);
			if (gen && text) descriptions.push({ generation: gen, text });
		} else {
			const label = m.name.slice("AbilityInfobox/desc/".length);
			const text = cleanInline(params.positional[0]);
			if (text) descriptions.push({ generation: label, text });
		}
	}

	const mapped = new Set(["name", "jpname", "jptrans", "jptranslit", "gen", "colorscheme"]);
	const raw_params: Record<string, string> = {};
	for (const [k, v] of Object.entries(p)) {
		if (mapped.has(k)) continue;
		const c = cleanInline(v);
		if (c) raw_params[k] = c;
	}

	return {
		name: get("name"),
		japanese_name: get("jpname") || null,
		japanese_translation: get("jptrans") || null,
		generation: romanToInt(get("gen")),
		descriptions,
		raw_params,
	};
}
