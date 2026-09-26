import { cleanInline } from "../wikitext/clean.ts";
import { numCell, rows } from "./rows.ts";

export interface AbilityHolder {
	national_dex: number | null;
	name: string;
	form: string | null;
	types: string[];
	slot: "first" | "second" | "hidden" | "unknown";
	abilities: { first: string | null; second: string | null; hidden: string | null };
}

export function parseAbilityPokemon(wikitext: string, abilityName: string): AbilityHolder[] {
	const want = abilityName.trim().toLowerCase();
	return rows(wikitext, (n) => /^ability\/entry$/i.test(n)).map((r) => {
		const p = r.positional.map(cleanInline);
		const none = (v: string | undefined) => (!v || v.toLowerCase() === "none" ? null : v);
		const abilities = { first: none(p[4]), second: none(p[5]), hidden: none(p[6]) };
		let slot: AbilityHolder["slot"] = "unknown";
		if (abilities.first?.toLowerCase() === want) slot = "first";
		else if (abilities.second?.toLowerCase() === want) slot = "second";
		else if (abilities.hidden?.toLowerCase() === want) slot = "hidden";
		return {
			national_dex: numCell(p[0]),
			name: p[1],
			form: cleanInline(r.named.form ?? "").replace(/^-/, "") || null,
			types: [...new Set([p[2], p[3]].filter(Boolean))],
			slot,
			abilities,
		};
	});
}
