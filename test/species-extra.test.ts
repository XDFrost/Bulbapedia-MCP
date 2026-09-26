import { describe, expect, it } from "vitest";
import { parseDexEntries, parseEvolution, parseGameLocations, parseHeldItems, parseLearnset, parseOtherLanguages, parseTypeEffectiveness } from "../worker/parsers/species-extra.ts";
import { classifySprite } from "../worker/bulbapedia/images.ts";
import { fixture } from "./helpers.ts";

describe("parseLearnset", () => {
	const ls = parseLearnset(fixture("pikachu.learnset.wiki"));
	it("parses gen 9 level-up rows", () => {
		expect(ls.games).toContain("SV");
		expect(ls.level_up.find((m) => m.move === "Thunder Wave")).toMatchObject({ level: 4, type: "Electric", category: "Status", power: null, accuracy: 90, pp: 20 });
		expect(ls.level_up.find((m) => m.move === "Thunder Shock")).toMatchObject({ level: 1, power: 40, accuracy: 100, pp: 30 });
	});
	it("parses ZA rows with the leading note column", () => {
		const dk = ls.level_up.find((m) => m.move === "Draining Kiss")!;
		expect(dk).toMatchObject({ level: 10, type: "Fairy", category: "Special", power: 50, pp: 7, accuracy: null });
		expect(dk.note).toContain("Rem.");
	});
	it("parses tm, breeding and event rows", () => {
		expect(ls.tm.find((m) => m.move === "Take Down")).toMatchObject({ machine: "TM001", power: 90, accuracy: 85, pp: 20 });
		expect(ls.breeding[0].parents).toContain("Mareep");
		expect(ls.breeding[0].parents.length).toBeGreaterThan(5);
		expect(ls.event[0]).toMatchObject({ move: "Fly", type: "Flying", power: 90, accuracy: 95, pp: 15 });
		expect(ls.event[0].source).toContain("Pikachu");
	});
	it("parses a gen 3 subpage (no category column, tutor + prevo rows)", () => {
		const g3 = parseLearnset(fixture("pikachu.gen3learnset.wiki"));
		expect(g3.level_up[0]).toMatchObject({ level: 1, move: "ThunderShock", type: "Electric", category: null, power: 40, accuracy: 100, pp: 30 });
		expect(g3.tm.find((m) => m.machine === "TM01")).toMatchObject({ move: "Focus Punch", power: 150 });
		expect(g3.tutor.find((m) => m.move === "Body Slam")).toMatchObject({ power: 85, accuracy: 100, pp: 15 });
		expect(g3.prevolution.find((m) => m.move === "Charm")).toMatchObject({ from: "Pichu", type: "Normal", accuracy: 100, pp: 20 });
		expect(g3.breeding.find((m) => m.move === "Bide")?.parents).toEqual(["Seedot"]);
		expect(g3.event.length).toBe(2);
	});
});

describe("parseTypeEffectiveness", () => {
	const te = parseTypeEffectiveness(fixture("pikachu.typeeff.wiki"))!;
	it("maps multipliers", () => {
		expect(te.types).toEqual(["Electric"]);
		expect(te.multipliers.Ground).toBe(2);
		expect(te.multipliers.Flying).toBe(0.5);
		expect(te.weaknesses).toEqual([{ type: "Ground", multiplier: 2 }]);
		expect(te.resistances.map((r) => r.type).sort()).toEqual(["Electric", "Flying", "Steel"]);
		expect(te.immunities).toEqual([]);
		expect(te.ability_notes.lightningrod).toBe("maybe");
	});
});

describe("parseEvolution", () => {
	it("parses a branching Evobox (Pikachu)", () => {
		const ev = parseEvolution(fixture("pikachu.evolution.wiki"));
		expect(ev.stages.map((s) => `${s.stage}${s.branch ?? ""}:${s.name}`)).toEqual(["1:Pichu", "2:Pikachu", "3a:Raichu", "3b:Raichu"]);
		expect(ev.stages[1].method).toContain("friendship");
		expect(ev.stages[2].method).toContain("Thunder Stone");
		expect(ev.stages[3]).toMatchObject({ form: "Alolan Form", types: ["Electric", "Psychic"] });
		expect(ev.stages[3].method).toContain("Alola");
		expect(ev.notes).toContain("cannot evolve");
	});
	it("parses a table-style Evobox (Eevee) and pairs methods", () => {
		const ev = parseEvolution(fixture("eevee.evolution.wiki"));
		expect(ev.stages[0].name).toBe("Eevee");
		expect(ev.stages.length).toBe(9);
		expect(ev.methods_in_order).toBeUndefined();
		expect(ev.stages[1].method).toBe("Water Stone");
		const leafeon = ev.stages.find((s) => s.name === "Leafeon")!;
		expect(leafeon.method).toContain("Moss Rock");
		expect(leafeon.method).toContain("Leaf Stone");
		expect(ev.stages.find((s) => s.name === "Sylveon")!.method).toContain("Fairy");
	});
});

describe("parseDexEntries", () => {
	const d = parseDexEntries(fixture("pikachu.dexentries.wiki"));
	it("parses entries with generation, games and forms", () => {
		const rb = d.entries.find((e) => e.games.includes("Red"))!;
		expect(rb).toMatchObject({ generation: 1, games: ["Red", "Blue"] });
		expect(rb.text).toContain("lightning storms");
		expect(d.entries.find((e) => e.games.includes("Yellow"))?.text).toContain("tail raised");
		expect(d.entries.some((e) => e.form?.includes("Original Cap"))).toBe(true);
		expect(d.entries.length).toBeGreaterThan(40);
	});
	it("collects regional dex numbers", () => {
		expect(d.regional_dex_numbers).toContainEqual({ generation: 1, region: "Kanto", number: 25 });
		expect(d.regional_dex_numbers).toContainEqual({ generation: 3, region: "Hoenn", number: 156 });
		expect(d.regional_dex_numbers.find((r) => r.region === "Coastal Kalos")?.number).toBeNull();
	});
});

describe("parseGameLocations", () => {
	const g = parseGameLocations(fixture("pikachu.locations.wiki"));
	it("parses availability rows", () => {
		const rb = g.locations.find((l) => l.games[0] === "Red" && l.generation === 1)!;
		expect(rb.area).toContain("Viridian Forest");
		expect(rb.area).toContain("Power Plant");
		expect(rb.obtainable).toBe(true);
		expect(g.locations.find((l) => l.games.includes("Black"))!.obtainable).toBe(false);
		expect(g.locations.find((l) => l.note === "(Japan)")?.games).toEqual(["Blue"]);
	});
	it("parses event distributions", () => {
		expect(g.events.length).toBeGreaterThan(100);
		expect(g.events[0]).toMatchObject({ game: "RGB", language: "Japanese", region: "Japan", level: 5, date: "May 15 to June 12, 1997" });
	});
});

describe("parseHeldItems", () => {
	const h = parseHeldItems(fixture("pikachu.helditems.wiki"));
	it("pairs games with items", () => {
		expect(h[0].games).toEqual(["Red", "Blue"]);
		expect(h[0].items).toEqual([{ item: "Berry", chance: "100" }]);
		expect(h.find((x) => x.items.some((i) => i.item === "Light Ball"))).toBeTruthy();
		const la = h.find((x) => x.items.some((i) => i.item === "Seed of Mastery"))!;
		expect(la.items.find((i) => i.item === "Oran Berry")?.chance).toBe("35");
	});
});

describe("parseOtherLanguages", () => {
	it("parses the Other languages template", () => {
		const names = parseOtherLanguages(fixture("pikachu.languages.wiki"));
		const ja = names.find((n) => n.code === "ja")!;
		expect(ja.language).toBe("Japanese");
		expect(ja.name).toContain("ピカチュウ");
		expect(ja.meaning).toContain("onomatopoeia");
		expect(names.find((n) => n.code === "fr")?.name).toBe("Pikachu");
		expect(names.length).toBeGreaterThan(8);
	});
	it("parses langtable on an item page", () => {
		const names = parseOtherLanguages(fixture("thunderstone.page.wiki"));
		expect(names.find((n) => n.code === "fr")?.name).toContain("Pierre Foudre");
		expect(names.find((n) => n.code === "zh_yue")?.language).toBe("Cantonese Chinese");
	});
});

describe("classifySprite", () => {
	it("classifies sprite file names", () => {
		expect(classifySprite("Spr 5b 025 s.png")).toMatchObject({ kind: "sprite", generation: 5, game: "Black/White", shiny: true, back: false });
		expect(classifySprite("Spr b g1 025.png")).toMatchObject({ kind: "sprite", generation: 1, back: true });
		expect(classifySprite("Spr b 4d 025 f.png")).toMatchObject({ generation: 4, back: true, female: true });
		expect(classifySprite("HOME0025.png")).toMatchObject({ kind: "home" });
		expect(classifySprite("Menu HOME 0025.png")).toMatchObject({ kind: "menu" });
		expect(classifySprite("0025Pikachu.png")).toMatchObject({ kind: "artwork" });
		expect(classifySprite("Spr 8s 025Gi s.png")).toMatchObject({ generation: 8, form: "Gi", shiny: true });
		expect(classifySprite("Spr 7p 025P f.png")).toMatchObject({ generation: 7, form: "P", female: true });
		expect(classifySprite("HOME0025 f s.png")).toMatchObject({ kind: "home", female: true, shiny: true });
	});
});
