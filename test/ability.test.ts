import { describe, expect, it } from "vitest";
import { parseAbilityInfobox } from "../worker/parsers/ability.ts";
import { fixture } from "./helpers.ts";

describe("parseAbilityInfobox (Static)", () => {
	const a = parseAbilityInfobox(fixture("static.section0.wiki"))!;
	it("parses header", () => {
		expect(a.name).toBe("Static");
		expect(a.generation).toBe(3);
		expect(a.japanese_translation).toBe("Static Electricity");
	});
	it("collects per-generation descriptions", () => {
		expect(a.descriptions.length).toBeGreaterThanOrEqual(7);
		expect(a.descriptions[0]).toEqual({ generation: "III", text: "Paralyzes on contact." });
		expect(a.descriptions.find((d) => d.generation === "Champions")?.text).toContain("30% chance");
	});
});
