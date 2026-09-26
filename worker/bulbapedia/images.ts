import { apiGet } from "./client.ts";
import { pad4 } from "../parsers/rows.ts";

export interface FileInfo {
	file: string;
	url: string | null;
	width: number | null;
	height: number | null;
	mime: string | null;
}

function fileTitle(name: string): string {
	const n = name.trim().replace(/^File:/i, "").replace(/_/g, " ");
	return `File:${n}`;
}

/** Resolve up to 50 file names per call to direct archive URLs. Missing files get url null. */
export async function fileUrls(names: string[]): Promise<FileInfo[]> {
	const unique = [...new Set(names.map(fileTitle))];
	const out: FileInfo[] = [];
	for (let i = 0; i < unique.length; i += 50) {
		const batch = unique.slice(i, i + 50);
		const d = await apiGet<{ query?: { pages?: { title: string; missing?: boolean; imageinfo?: { url: string; width: number; height: number; mime: string }[] }[] } }>({
			action: "query",
			titles: batch.join("|"),
			prop: "imageinfo",
			iiprop: "url|size|mime",
		});
		const byTitle = new Map((d.query?.pages ?? []).map((p) => [p.title, p]));
		for (const t of batch) {
			const p = byTitle.get(t);
			const ii = p?.imageinfo?.[0];
			out.push({ file: t.replace(/^File:/, ""), url: ii?.url ?? null, width: ii?.width ?? null, height: ii?.height ?? null, mime: ii?.mime ?? null });
		}
	}
	return out;
}

/** Predictable image names for a species: HOME render, menu icon, official artwork. */
export function standardImageNames(ndex: number, name: string): { home: string; menu: string; artwork: string } {
	return { home: `HOME${pad4(ndex)}.png`, menu: `Menu HOME ${pad4(ndex)}.png`, artwork: `${pad4(ndex)}${name.replace(/ /g, "_")}.png` };
}

export interface SpeciesImages {
	sprite_url: string | null;
	icon_url: string | null;
	artwork_url: string | null;
}

/** HOME render + menu icon + artwork URLs for many species in as few API calls as possible. */
export async function speciesImages(list: { ndex: number; name: string }[]): Promise<Map<number, SpeciesImages>> {
	const names: string[] = [];
	for (const s of list) {
		const n = standardImageNames(s.ndex, s.name);
		names.push(n.home, n.menu, n.artwork);
	}
	const infos = await fileUrls(names);
	const byFile = new Map(infos.map((i) => [i.file.replace(/_/g, " "), i.url]));
	const out = new Map<number, SpeciesImages>();
	for (const s of list) {
		const n = standardImageNames(s.ndex, s.name);
		out.set(s.ndex, {
			sprite_url: byFile.get(n.home.replace(/_/g, " ")) ?? null,
			icon_url: byFile.get(n.menu.replace(/_/g, " ")) ?? null,
			artwork_url: byFile.get(n.artwork.replace(/_/g, " ")) ?? null,
		});
	}
	return out;
}

/** Images used in one rendered section of a page (template-expanded), as file names. */
export async function sectionImages(title: string, section: string | number): Promise<string[]> {
	const d = await apiGet<{ parse: { images: string[] } }>({ action: "parse", page: title, prop: "images", section: String(section), redirects: 1 });
	return d.parse.images;
}

const GEN_CODES: Record<string, { generation: number; game: string }> = {
	"1b": { generation: 1, game: "Blue" }, "1r": { generation: 1, game: "Red" }, "1g": { generation: 1, game: "Green" }, "1y": { generation: 1, game: "Yellow" },
	"2g": { generation: 2, game: "Gold" }, "2s": { generation: 2, game: "Silver" }, "2c": { generation: 2, game: "Crystal" },
	"3r": { generation: 3, game: "Ruby/Sapphire" }, "3e": { generation: 3, game: "Emerald" }, "3f": { generation: 3, game: "FireRed/LeafGreen" },
	"4d": { generation: 4, game: "Diamond/Pearl" }, "4p": { generation: 4, game: "Platinum" }, "4h": { generation: 4, game: "HeartGold/SoulSilver" },
	"5b": { generation: 5, game: "Black/White" }, "5b2": { generation: 5, game: "Black 2/White 2" },
	"6x": { generation: 6, game: "X/Y" }, "6o": { generation: 6, game: "Omega Ruby/Alpha Sapphire" },
	"7s": { generation: 7, game: "Sun/Moon" }, "7p": { generation: 7, game: "Let's Go" },
	"8s": { generation: 8, game: "Sword/Shield" }, "8b": { generation: 8, game: "Brilliant Diamond/Shining Pearl" }, "8h": { generation: 8, game: "Legends: Arceus" },
	"9s": { generation: 9, game: "Scarlet/Violet" },
};

export interface SpriteInfo {
	file: string;
	url: string | null;
	kind: "sprite" | "home" | "menu" | "artwork" | "other";
	generation: number | null;
	game: string | null;
	shiny: boolean;
	back: boolean;
	female: boolean;
	/** Form suffix from the file name, e.g. "Gi" (Gigantamax), "C" (Cosplay), "Alola". */
	form?: string;
	width: number | null;
	height: number | null;
}

/** Classify a Bulbapedia image file name (e.g. "Spr_5b_025_s.png", "HOME0025.png"). */
export function classifySprite(file: string): Omit<SpriteInfo, "url" | "width" | "height"> {
	const f = file.replace(/_/g, " ");
	// Generation I back sprites: "Spr b g1 025.png"
	let m = /^Spr b g(\d) (\d+)( s)?\.(png|gif)$/i.exec(f);
	if (m) return { file, kind: "sprite", generation: Number.parseInt(m[1], 10), game: null, shiny: !!m[3], back: true, female: false };
	m = /^Spr (b )?(\d[a-z0-9]*?) (\d+)([A-Za-z][A-Za-z-]*)?( ?[fm])?( s)?\.(png|gif)$/i.exec(f);
	if (m) {
		const code = GEN_CODES[m[2].toLowerCase()];
		return {
			file,
			kind: "sprite",
			generation: code?.generation ?? Number.parseInt(m[2][0], 10),
			game: code?.game ?? m[2],
			shiny: !!m[6],
			back: !!m[1],
			female: /f/i.test(m[5] ?? ""),
			...(m[4] ? { form: m[4] } : {}),
		};
	}
	m = /^HOME\d+([A-Za-z-]+)?( f)?( s)?\.png$/i.exec(f);
	if (m) return { file, kind: "home", generation: null, game: "Pokémon HOME", shiny: !!m[3], back: false, female: !!m[2], ...(m[1] ? { form: m[1] } : {}) };
	if (/^Menu HOME/i.test(f) || /^\d+MS\.png$/i.test(f)) return { file, kind: "menu", generation: null, game: null, shiny: false, back: false, female: false };
	if (/^\d{4}[A-Z]/.test(f) && !/MS\.png$/i.test(f)) return { file, kind: "artwork", generation: null, game: null, shiny: false, back: false, female: false };
	return { file, kind: "other", generation: null, game: null, shiny: false, back: false, female: false };
}
