import { describe, expect, it } from "vitest";
import { parsePokemonInfobox, parseStatsBlocks, pickCurrentStats } from "../worker/parsers/pokemon.ts";
import { fixture } from "./helpers.ts";

describe("parsePokemonInfobox (Pikachu)", () => {
	const info = parsePokemonInfobox(fixture("pikachu.section0.wiki"))!;
	it("parses identity and types", () => {
		expect(info.name).toBe("Pikachu");
		expect(info.national_dex).toBe(25);
		expect(info.types).toEqual(["Electric"]);
		expect(info.category).toBe("Mouse Pokémon");
		expect(info.generation).toBe(1);
		expect(info.japanese_name).toBe("ピカチュウ");
	});
	it("parses abilities, egg groups and numbers", () => {
		expect(info.abilities).toEqual({ regular: ["Static"], hidden: "Lightning Rod" });
		expect(info.egg_groups).toEqual(["Field", "Fairy"]);
		expect(info.egg_cycles).toBe(10);
		expect(info.catch_rate).toBe(190);
		expect(info.base_exp).toBe(112);
		expect(info.base_friendship).toBe(70);
		expect(info.height_m).toBe(0.4);
		expect(info.weight_kg).toBe(6);
		expect(info.gender_ratio).toBe("50% male, 50% female");
		expect(info.color).toBe("Yellow");
	});
	it("keeps plain-text forms and skips randomised ones", () => {
		expect(info.forms).toContain("Cosplay Pikachu");
		expect(info.forms).toContain("Gigantamax");
		expect(info.forms.some((f) => f.includes("#switch"))).toBe(false);
	});
	it("returns null when there is no infobox", () => {
		expect(parsePokemonInfobox("nothing here")).toBeNull();
	});
});

describe("parseStatsBlocks (Pikachu)", () => {
	const blocks = parseStatsBlocks(fixture("pikachu.basestats.wiki"));
	it("finds every Stats block with labels", () => {
		expect(blocks.length).toBe(3);
		expect(blocks[0].label).toContain("Generations I");
		expect(blocks[0].variant).toBe("Stats");
		expect(blocks[0].special).toBe(50);
		expect(blocks[2].variant).toBe("Stats/PE");
		expect(blocks[2].label).toBe("Partner Pikachu");
	});
	it("picks the latest core-series block as current", () => {
		const cur = pickCurrentStats(blocks)!;
		expect(cur.label).toContain("Generation VI");
		expect(cur).toMatchObject({ hp: 35, attack: 55, defense: 40, sp_atk: 50, sp_def: 50, speed: 90, total: 320 });
	});
});
