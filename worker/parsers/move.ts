import { parseTemplate, romanToInt, splitTopLevel, findTemplate } from "../wikitext/templates.ts";
import { cleanInline, parseIntLoose } from "../wikitext/clean.ts";

export interface MoveInfo {
	name: string;
	japanese_name: string | null;
	japanese_translation: string | null;
	index: number | null;
	type: string | null;
	damage_category: string | null;
	power: number | null;
	power_note: string | null;
	accuracy: number | null;
	accuracy_note: string | null;
	pp: number | null;
	max_pp: number | null;
	generation: number | null;
	makes_contact: boolean | null;
	affected_by_protect: boolean | null;
	affected_by_magic_coat: boolean | null;
	affected_by_snatch: boolean | null;
	affected_by_mirror_move: boolean | null;
	affected_by_kings_rock: boolean | null;
	sound_based: boolean | null;
	/** TM/TR numbers keyed by generation, e.g. { "1": "TM24", "8": "TR08" }. */
	machines: Record<string, string>;
	raw_params: Record<string, string>;
}

function yesNo(v: string | undefined): boolean | null {
	if (v === undefined) return null;
	const c = cleanInline(v).toLowerCase();
	if (c === "yes") return true;
	if (c === "no") return false;
	return null;
}

/** For values like `{{tt|90|95 in Generations I-V}}` return { value: 90, note: "95 in Generations I-V" }. */
function valueWithNote(raw: string | undefined): { value: number | null; note: string | null } {
	if (raw === undefined) return { value: null, note: null };
	const tt = findTemplate(raw, "tt");
	if (tt) {
		const parts = splitTopLevel(tt.body.replace(/^\|/, ""));
		return { value: parseIntLoose(parts[0]), note: cleanInline(parts[1]) || null };
	}
	const c = cleanInline(raw);
	if (c === "" || c === "—" || c === "-" || c === "&mdash;") return { value: null, note: null };
	return { value: parseIntLoose(raw), note: null };
}

export function parseMoveInfobox(wikitext: string): MoveInfo | null {
	const t = parseTemplate(wikitext, "MoveInfobox");
	if (!t) return null;
	const p = t.named;
	const get = (k: string) => (p[k] !== undefined ? cleanInline(p[k]) : "");
	const power = valueWithNote(p.power);
	const accuracy = valueWithNote(p.accuracy);

	const machines: Record<string, string> = {};
	for (const [k, v] of Object.entries(p)) {
		const m = /^(tm|tr|hm)#(\d+)$/i.exec(k);
		if (m) {
			const num = cleanInline(v);
			if (num) machines[m[2]] = `${m[1].toUpperCase()}${num.padStart(2, "0")}`;
		}
	}

	const mapped = new Set([
		"name", "jname", "jtrans", "jtranslit", "n", "type", "damagecategory", "power", "accuracy", "basepp",
		"maxpp", "gen", "touches", "protect", "magiccoat", "snatch", "mirrormove", "kingsrock", "sound",
	]);
	const raw_params: Record<string, string> = {};
	for (const [k, v] of Object.entries(p)) {
		if (mapped.has(k) || /^(tm|tr|hm)#?\d*$/i.test(k) || /^gameimage/.test(k)) continue;
		const c = cleanInline(v);
		if (c) raw_params[k] = c;
	}

	return {
		name: get("name"),
		japanese_name: get("jname") || null,
		japanese_translation: get("jtrans") || null,
		index: parseIntLoose(p.n),
		type: get("type") || null,
		damage_category: get("damagecategory") || null,
		power: power.value,
		power_note: power.note,
		accuracy: accuracy.value,
		accuracy_note: accuracy.note,
		pp: parseIntLoose(p.basepp),
		max_pp: parseIntLoose(p.maxpp),
		generation: romanToInt(get("gen")) ?? parseIntLoose(p.gen),
		makes_contact: yesNo(p.touches),
		affected_by_protect: yesNo(p.protect),
		affected_by_magic_coat: yesNo(p.magiccoat),
		affected_by_snatch: yesNo(p.snatch),
		affected_by_mirror_move: yesNo(p.mirrormove),
		affected_by_kings_rock: yesNo(p.kingsrock),
		sound_based: yesNo(p.sound),
		machines,
		raw_params,
	};
}
