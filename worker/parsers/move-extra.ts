import { cleanInline } from "../wikitext/clean.ts";
import { gameAbbrevs, numCell, rows, splitByHeadings } from "./rows.ts";

export interface MoveDescription {
	games: string[];
	text: string;
}

export function parseMoveDescriptions(wikitext: string): MoveDescription[] {
	return rows(wikitext, "movedescentry")
		.map((r) => {
			const games = gameAbbrevs(r.positional[0] ?? "");
			return { games: games.length ? games : [cleanInline(r.positional[0])].filter(Boolean), text: cleanInline(r.positional[1]) };
		})
		.filter((d) => d.text);
}

export type LearnMethod = "level_up" | "tm" | "breeding" | "tutor" | "special" | "champions" | "other";

export interface MoveLearner {
	method: LearnMethod;
	national_dex: number | null;
	name: string;
	form: string | null;
	types: string[];
	egg_groups: string[];
	/** Per-column values (e.g. level or ✔), keyed by generation label such as "VII-2". Empty cells omitted. */
	by_generation: Record<string, string>;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function columnLabels(head: { named: Record<string, string> } | undefined, count: number): string[] {
	const labels: string[] = [];
	for (let g = 1; g <= 10 && labels.length < count; g++) {
		const n = Number.parseInt(head?.named[`g${g}`] ?? "1", 10) || 1;
		for (let k = 1; k <= n && labels.length < count; k++) labels.push(n === 1 ? ROMAN[g - 1] : `${ROMAN[g - 1]}-${k}`);
	}
	while (labels.length < count) labels.push(`col${labels.length + 1}`);
	return labels;
}

function methodFor(heading: string): LearnMethod {
	const h = heading.toLowerCase();
	if (h.includes("level")) return "level_up";
	if (h.includes("tm") || h.includes("hm") || h.includes("tr")) return "tm";
	if (h.includes("breed")) return "breeding";
	if (h.includes("tutor")) return "tutor";
	if (h.includes("champions")) return "champions";
	if (h.includes("special") || h.includes("event")) return "special";
	return "other";
}

export function parseMoveLearners(wikitext: string): MoveLearner[] {
	const out: MoveLearner[] = [];
	let method: LearnMethod = "other";
	for (const block of splitByHeadings(wikitext)) {
		if (block.heading) method = methodFor(block.heading);
		const head = rows(block.text, (n) => /^Movehead\/(Games|TMGames|Special|Champions)$/i.test(n))[0];
		for (const r of rows(block.text, (n) => /^Moveentry\/(\d+|Champions)$/i.test(n))) {
			const p = r.positional;
			const m = /^Moveentry\/(\d+|Champions)$/i.exec(r.name)!;
			const isChampions = /champions/i.test(m[1]);
			const count = isChampions ? 1 : Number.parseInt(m[1], 10);
			const cells = isChampions ? p.slice(2, 3) : p.slice(5, 5 + count);
			const labels = isChampions ? ["Champions"] : columnLabels(head, count);
			const by_generation: Record<string, string> = {};
			cells.forEach((c, i) => {
				const v = cleanInline(c.replace(/<br\s*\/?>/gi, " / "));
				if (v && v !== "−" && v !== "-" && v !== "—") by_generation[labels[i]] = v;
			});
			out.push({
				method,
				national_dex: numCell(p[0]),
				name: cleanInline(p[1]),
				form: cleanInline(r.named.form ?? "") || null,
				types: [r.named.type, r.named.type2].filter(Boolean).map((t) => cleanInline(t)),
				egg_groups: isChampions ? [] : [...new Set([p[3], p[4]].map(cleanInline).filter(Boolean))],
				by_generation,
			});
		}
	}
	return out;
}
