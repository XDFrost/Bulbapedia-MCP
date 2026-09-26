import { describe, expect, it } from "vitest";
import { parseDexList } from "../worker/parsers/dex.ts";
import { fixture } from "./helpers.ts";

describe("parseDexList", () => {
	const idx = parseDexList(fixture("natdex.wiki"));
	it("parses every species row with generation tags", () => {
		expect(idx.species.length).toBeGreaterThanOrEqual(1025);
		expect(idx.species[0]).toEqual({ national_dex: 1, name: "Bulbasaur", types: ["Grass", "Poison"], generation: 1 });
		const gen1 = idx.species.filter((r) => r.generation === 1);
		expect(gen1.length).toBe(151);
		expect(gen1[150].name).toBe("Mew");
		expect(idx.species.find((r) => r.national_dex === 150)).toMatchObject({ name: "Mewtwo", types: ["Psychic"] });
	});
	it("ignores named params like forms=/formname= when reading types", () => {
		expect(idx.species.find((r) => r.name === "Rattata")!.types).toEqual(["Normal"]);
		expect(idx.species.find((r) => r.name === "Flabébé")!.types).toEqual(["Fairy"]);
	});
	it("parses form rows", () => {
		const alolan = idx.forms.find((f) => f.name === "Rattata")!;
		expect(alolan).toMatchObject({ national_dex: 19, form: "Alolan Form", form_suffix: "-Alola", types: ["Dark", "Normal"], generation: 1 });
		expect(idx.forms.length).toBeGreaterThan(100);
	});
	it("handles unreleased entries with ???? numbers", () => {
		const unreleased = idx.species.filter((r) => r.national_dex === null);
		expect(unreleased.every((r) => r.generation === 10)).toBe(true);
	});
	it("gen 1 electric filter matches expectations", () => {
		const names = idx.species.filter((r) => r.generation === 1 && r.types.includes("Electric")).map((r) => r.name);
		expect(names).toEqual(["Pikachu", "Raichu", "Magnemite", "Magneton", "Voltorb", "Electrode", "Electabuzz", "Jolteon", "Zapdos"]);
	});
});
