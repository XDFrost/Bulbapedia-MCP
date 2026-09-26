import { describe, expect, it } from "vitest";
import { cleanInline, cleanWikitext, parseIntLoose, stripHtml } from "../worker/wikitext/clean.ts";
import { fixture } from "./helpers.ts";

describe("cleanWikitext", () => {
	it("resolves common inline templates and links", () => {
		expect(cleanInline("{{p|Pikachu}} uses {{m|Thunderbolt}} on {{type|Electric}} {{OBP|Pokémon|species}}")).toBe("Pikachu uses Thunderbolt on Electric Pokémon");
		expect(cleanInline("{{tt|90|95 in Generations I-V}}")).toBe("90");
		expect(cleanInline("[[Contest combination|Pokémon Contest combination]] and [[Raichu]]")).toBe("Pokémon Contest combination and Raichu");
		expect(cleanInline("{{status|Paralysis|paralyzing}}")).toBe("paralyzing");
	});
	it("drops comments, refs, files and tables", () => {
		expect(cleanInline("112<!--105 in Gen V-VI-->")).toBe("112");
		expect(cleanInline("text<ref>source</ref> more<ref name=x/>")).toBe("text more");
		expect(cleanInline("[[File:HOME0845Go.png|thumb|left|200px|A {{p|Cramorant}} [[link|x]]]] body")).toBe("body");
		expect(cleanWikitext("before\n{| class=x\n! a\n|-\n| b\n|}\nafter")).toBe("before\n\nafter");
	});
	it("renders headings and cleans a real Biology section with no leftover markup", () => {
		const out = cleanWikitext(fixture("pikachu.biology.wiki"));
		expect(out.startsWith("## Biology")).toBe(true);
		expect(out).toContain("Pikachu is a short, chubby rodent Pokémon.");
		expect(out).not.toContain("{{");
		expect(out).not.toContain("[[");
		expect(out).not.toContain("<ref");
	});
	it("cleans the Thunderbolt effect section", () => {
		const out = cleanWikitext(fixture("thunderbolt.effect.wiki"));
		expect(out).toContain("10% chance of paralyzing the target");
		expect(out).not.toContain("{{");
	});
	it("parses loose ints", () => {
		expect(parseIntLoose("0025")).toBe(25);
		expect(parseIntLoose("1,000,000")).toBe(1000000);
		expect(parseIntLoose(undefined)).toBeNull();
	});
	it("strips search snippet html", () => {
		expect(stripHtml('<span class="searchmatch">Pikachu</span> is &quot;great&quot;')).toBe('Pikachu is "great"');
	});
});

describe("editorial notices", () => {
	it("drops research/incomplete notices but keeps prose", () => {
		const out = cleanWikitext(fixture("static.effect.wiki"));
		expect(out).not.toContain("Does the Ability still activate");
		expect(out).toContain("there is a chance that the attacking Pokémon will become paralyzed");
	});
	it("drops unknown multi-line single-arg templates and renders name templates", () => {
		expect(cleanInline("{{Whatever|\n* long editorial\n* content}} kept")).toBe("kept");
		expect(cleanInline("{{Cramorant}} {{Sup/9|SV}}")).toBe("Cramorant (SV)");
		expect(cleanInline("{{Ash}} and {{an|Misty}}")).toBe("Ash and Misty");
		expect(cleanInline("{{bag/s|Water Stone|SV}} {{color2|000|Water Stone}}")).toBe("Water Stone");
	});
});
