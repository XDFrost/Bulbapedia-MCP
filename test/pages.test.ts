import { describe, expect, it } from "vitest";
import { parseCharacter, parseEpisode, parseGame, parseItem, parseLocation, parseTcgCard, parseTypePage } from "../worker/parsers/pages.ts";
import { fixture } from "./helpers.ts";

describe("parseItem (Thunder Stone)", () => {
	const it_ = parseItem(fixture("thunderstone.page.wiki"))!;
	it("parses infobox and tables", () => {
		expect(it_).toMatchObject({ name: "Thunder Stone", japanese_translation: "Lightning Stone", generation: 1, fling_power: 30 });
		expect(it_.bag_pockets.find((b) => b.generation === 8)?.pocket).toBe("Other Items");
		expect(it_.prices[0]).toMatchObject({ buy: 2100, sell: 1050 });
		expect(it_.prices[0].games).toContain("RGBY");
		expect(it_.descriptions.length).toBeGreaterThan(5);
		expect(it_.effect).toContain("Pikachu to evolve into Raichu");
		expect(it_.effect).not.toContain("{{");
	});
});

describe("parseLocation (Viridian Forest)", () => {
	const loc = parseLocation(fixture("viridianforest.page.wiki"))!;
	it("parses infobox, encounters, items, trainers", () => {
		expect(loc).toMatchObject({ name: "Viridian Forest", region: "Kanto", kind: "forest" });
		expect(loc.map_description).toContain("sprawling forest");
		const cat = loc.encounters.find((e) => e.name === "Caterpie")!;
		expect(cat).toMatchObject({ national_dex: 10, method: "Grass", levels: "3", version_flags: ["yes", "no", "no"] });
		expect(cat.rates).toEqual(["5%"]);
		expect(cat.section).toContain("Generation I");
		expect(loc.encounters.length).toBeGreaterThan(40);
		expect(loc.items[0]).toMatchObject({ item: "Antidote" });
		expect(loc.items[0].games).toEqual(["R", "B", "Y", "FR", "LG"]);
		const bc = loc.trainers.find((t) => t.class === "Bug Catcher")!;
		expect(bc.pokemon.map((p) => `${p.name}:${p.level}`)).toEqual(["Weedle:6", "Caterpie:6"]);
		expect(loc.trainers.find((t) => t.name === "Joana")!.pokemon[0]).toMatchObject({ name: "Rattata", level: 4 });
		expect(loc.intro).toContain("Viridian Forest");
	});
	it("parses a town infobox", () => {
		const town = parseLocation(fixture("pallettown.section0.wiki"))!;
		expect(town).toMatchObject({ name: "Pallet Town", region: "Kanto" });
		expect(town.connections.north).toBe("Route 1");
	});
});

describe("parseTypePage (Electric)", () => {
	const t = parseTypePage(fixture("electrictype.page.wiki"))!;
	it("parses relations, stats, lists", () => {
		expect(t.type).toBe("Electric");
		expect(t.offensive.super_effective).toEqual(["Flying", "Water"]);
		expect(t.offensive.no_effect).toEqual(["Ground"]);
		expect(t.defensive.weak_to).toEqual(["Ground"]);
		expect(t.average_base_stats?.Total).toBeCloseTo(458.19);
		expect(t.pokemon["Pure Electric-type Pokémon"].some((p) => p.name === "Pikachu")).toBe(true);
		expect(t.moves.find((m) => m.move === "Thunderbolt")).toMatchObject({ category: "Special", power: 90, accuracy: 100, pp: 15 });
		expect(t.abilities).toContain("Static");
	});
});

describe("parseEpisode (EP001)", () => {
	const e = parseEpisode(fixture("ep001.page.wiki"))!;
	it("parses infobox and sections", () => {
		expect(e).toMatchObject({ code: "EP001", title_en: "Pokémon - I Choose You!", broadcast_jp: "April 1, 1997", broadcast_us: "September 8, 1998", series: "Indigo League" });
		expect(e.next).toContain("EP002");
		expect(e.previous).toBeNull();
		expect(e.plot?.length).toBeGreaterThan(500);
		expect(e.major_events.length).toBeGreaterThan(3);
		expect(e.characters.humans).toContain("Ash");
		expect(e.characters.pokemon.length).toBeGreaterThan(3);
	});
});

describe("parseCharacter (Ash)", () => {
	const c = parseCharacter(fixture("ash.section0.wiki"))!;
	it("parses infobox family", () => {
		expect(c).toMatchObject({ name: "Ash Ketchum", japanese_name: "サトシ", romanized_name: "Satoshi" });
		expect(c.profile.age).toBe("10");
		expect(c.profile.hometown).toContain("Pallet Town");
		expect(c.anime?.debut).toContain("I Choose You!");
		expect(c.teams.some((t) => t.member.includes("Alola League"))).toBe(true);
	});
});

describe("parseTcgCard (Pikachu Base Set 58)", () => {
	const card = parseTcgCard(fixture("pikachu.baseset58.page.wiki"))!;
	it("parses card data", () => {
		expect(card.name).toBe("Pikachu");
		expect(card.image).toBe("PikachuBaseSet58.jpg");
		expect(card.prints[0]).toMatchObject({ type: "Lightning", cardno: "58/102", rarity: "Common" });
		expect(card.attacks[0]).toMatchObject({ name: "Gnaw", cost: ["Colorless"], damage: "10" });
		expect(card.pokedex?.ndex).toBe("25");
	});
});

describe("parseGame (Red and Blue)", () => {
	const g = parseGame(fixture("redblue.section0.wiki"))!;
	it("parses infobox", () => {
		expect(g.name).toBe("Pokémon Red Version");
		expect(g.name2).toBe("Pokémon Blue Version");
		expect(g.platform).toContain("Game Boy");
		expect(g.release_dates.na).toBeTruthy();
		expect(g.intro).toContain("Red");
	});
});
