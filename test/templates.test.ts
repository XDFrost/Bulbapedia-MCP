import { describe, expect, it } from "vitest";
import { findAllTemplates, findTemplate, intToRoman, parseTemplate, parseTemplateParams, romanToInt, splitTopLevel } from "../worker/wikitext/templates.ts";

describe("findTemplate", () => {
	it("finds a template with nested templates in values", () => {
		const t = "x {{Box|a={{tt|1|2}}|b=[[A|B]]}} y";
		const m = findTemplate(t, "Box");
		expect(m).not.toBeNull();
		expect(m!.body).toBe("|a={{tt|1|2}}|b=[[A|B]]");
		expect(t.slice(m!.start, m!.end)).toBe("{{Box|a={{tt|1|2}}|b=[[A|B]]}}");
	});
	it("does not match a prefix of a longer name", () => {
		expect(findTemplate("{{Stats/PE|HP=1}}", "Stats")).toBeNull();
		expect(findTemplate("{{Stats/PE|HP=1}}", (n) => n.startsWith("Stats"))?.name).toBe("Stats/PE");
	});
	it("finds all instances", () => {
		expect(findAllTemplates("{{A|1}} {{A|2}} {{B}}", "A").map((m) => m.body)).toEqual(["|1", "|2"]);
	});
});

describe("parseTemplateParams", () => {
	it("splits named and positional params at top level only", () => {
		const p = parseTemplateParams("|0025|Pikachu|type1=Electric|note={{tt|a|b}}|x=[[A|B]]");
		expect(p.positional).toEqual(["0025", "Pikachu"]);
		expect(p.named).toEqual({ type1: "Electric", note: "{{tt|a|b}}", x: "[[A|B]]" });
	});
	it("handles multi-line infobox bodies and names with spaces", () => {
		const p = parseTemplate("{{Pokémon Infobox\n|name=Pikachu\n|ndex=0025\n|type1=Electric\n}}", "Pokémon Infobox")!;
		expect(p.named.name).toBe("Pikachu");
		expect(p.named.ndex).toBe("0025");
	});
	it("splitTopLevel respects brackets", () => {
		expect(splitTopLevel("a|[[b|c]]|{{d|e}}|f")).toEqual(["a", "[[b|c]]", "{{d|e}}", "f"]);
	});
});

describe("roman numerals", () => {
	it("converts both ways", () => {
		expect(romanToInt("IX")).toBe(9);
		expect(romanToInt("iv")).toBe(4);
		expect(romanToInt("X")).toBe(10);
		expect(romanToInt("nope")).toBeNull();
		expect(intToRoman(9)).toBe("IX");
		expect(intToRoman(4)).toBe("IV");
		expect(intToRoman(10)).toBe("X");
	});
});
