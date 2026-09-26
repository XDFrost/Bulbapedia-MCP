import { describe, expect, it } from "vitest";
import { parseMoveDescriptions, parseMoveLearners } from "../worker/parsers/move-extra.ts";
import { parseAbilityPokemon } from "../worker/parsers/ability-extra.ts";
import { fixture } from "./helpers.ts";

describe("parseMoveDescriptions", () => {
	it("parses per-game descriptions", () => {
		const d = parseMoveDescriptions(fixture("thunderbolt.description.wiki"));
		expect(d.length).toBe(10);
		expect(d[0].games).toEqual(["Stad", "Stad2"]);
		expect(d[0].text).toContain("one-in-ten chance");
	});
});

describe("parseMoveLearners", () => {
	const l = parseMoveLearners(fixture("thunderbolt.learnset.wiki"));
	it("parses level-up learners with per-generation columns", () => {
		const pika = l.find((x) => x.name === "Pikachu" && x.method === "level_up" && !x.form)!;
		expect(pika).toMatchObject({ national_dex: 25, types: ["Electric"], egg_groups: ["Field", "Fairy"] });
		expect(pika.by_generation.I).toBe("26 (Y)");
		expect(pika.by_generation.V).toBe("29");
		expect(pika.by_generation["VII-1"]).toBe("42");
		expect(pika.by_generation["VII-2"]).toBe("21");
		expect(pika.by_generation.VI).toContain("ORAS");
		expect(Object.keys(pika.by_generation).length).toBe(13);
		const alolan = l.find((x) => x.name === "Raichu" && x.form === "Alolan Form")!;
		expect(alolan.types).toEqual(["Electric", "Psychic"]);
		expect(alolan.by_generation.I).toBeUndefined();
	});
	it("parses breeding and Champions learners", () => {
		expect(l.find((x) => x.method === "breeding" && x.name === "Mareep")?.by_generation).toEqual({ I: "✔" });
		const champs = l.filter((x) => x.method === "champions");
		expect(champs.length).toBe(65);
		expect(champs[0]).toMatchObject({ name: "Pikachu", by_generation: { Champions: "✔" } });
	});
});

describe("parseAbilityPokemon", () => {
	it("lists holders with slot detection", () => {
		const p = parseAbilityPokemon(fixture("static.pokemon.wiki"), "Static");
		expect(p.length).toBe(24);
		expect(p[0]).toMatchObject({ national_dex: 25, name: "Pikachu", slot: "first", types: ["Electric"], abilities: { first: "Static", second: null, hidden: "Lightning Rod" } });
		expect(p.find((x) => x.name === "Voltorb" && !x.form)?.slot).toBe("second");
		expect(p.find((x) => x.form === "Hisui")?.types).toEqual(["Electric", "Grass"]);
		expect(p.find((x) => x.name === "Tadbulb")?.slot).toBe("second");
	});
});
