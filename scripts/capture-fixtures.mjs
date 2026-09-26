// Captures live wikitext from Bulbapedia's API into test/fixtures.
// Run with: npm run fixtures  (optionally pass fixture names to refresh only those)
import { writeFile, mkdir } from "node:fs/promises";

const API = "https://bulbapedia.bulbagarden.net/w/api.php";
const UA = "bulbapedia-mcp/0.2 (fixture capture)";

async function api(params) {
	const url = new URL(API);
	url.search = new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString();
	const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
	if (!res.ok) throw new Error(`${res.status} for ${url}`);
	const data = await res.json();
	if (data.error) throw new Error(`${data.error.code}: ${data.error.info} for ${url}`);
	return data;
}

async function sectionIndex(page, heading, nth = 0) {
	const d = await api({ action: "parse", page, prop: "sections" });
	const all = d.parse.sections.filter((x) => x.line === heading);
	const s = all[nth];
	if (!s) throw new Error(`No section '${heading}' (#${nth}) on ${page}`);
	return s.index;
}
async function sectionWikitext(page, section) {
	const d = await api({ action: "parse", page, prop: "wikitext", section: String(section) });
	return d.parse.wikitext;
}
async function pageWikitext(page) {
	const d = await api({ action: "parse", page, prop: "wikitext" });
	return d.parse.wikitext;
}

const PIKA = "Pikachu (Pokémon)";
const jobs = {
	"pikachu.section0.wiki": () => sectionWikitext(PIKA, 0),
	"pikachu.basestats.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Base stats")),
	"pikachu.biology.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Biology")),
	"pikachu.dexentries.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Pokédex entries")),
	"pikachu.locations.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Game locations")),
	"pikachu.helditems.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Held items")),
	"pikachu.typeeff.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Type effectiveness")),
	"pikachu.learnset.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Learnset")),
	"pikachu.evolution.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Evolution data")),
	"pikachu.sprites.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "Sprites")),
	"pikachu.languages.wiki": async () => sectionWikitext(PIKA, await sectionIndex(PIKA, "In other languages")),
	"pikachu.gen3learnset.wiki": () => pageWikitext("Pikachu (Pokémon)/Generation III learnset"),
	"eevee.evolution.wiki": async () => sectionWikitext("Eevee (Pokémon)", await sectionIndex("Eevee (Pokémon)", "Evolution data")),
	"thunderbolt.section0.wiki": () => sectionWikitext("Thunderbolt (move)", 0),
	"thunderbolt.effect.wiki": async () => sectionWikitext("Thunderbolt (move)", await sectionIndex("Thunderbolt (move)", "Effect")),
	"thunderbolt.description.wiki": async () => sectionWikitext("Thunderbolt (move)", await sectionIndex("Thunderbolt (move)", "Description")),
	"thunderbolt.learnset.wiki": async () => sectionWikitext("Thunderbolt (move)", await sectionIndex("Thunderbolt (move)", "Learnset")),
	"static.section0.wiki": () => sectionWikitext("Static (Ability)", 0),
	"static.effect.wiki": async () => sectionWikitext("Static (Ability)", await sectionIndex("Static (Ability)", "Effect")),
	"static.pokemon.wiki": async () => sectionWikitext("Static (Ability)", await sectionIndex("Static (Ability)", "Pokémon with Static")),
	"thunderstone.page.wiki": () => pageWikitext("Thunder Stone"),
	"viridianforest.page.wiki": () => pageWikitext("Viridian Forest"),
	"pallettown.section0.wiki": () => sectionWikitext("Pallet Town", 0),
	"electrictype.page.wiki": () => pageWikitext("Electric (type)"),
	"ep001.page.wiki": () => pageWikitext("EP001"),
	"ash.section0.wiki": () => sectionWikitext("Ash Ketchum", 0),
	"pikachu.baseset58.page.wiki": () => pageWikitext("Pikachu (Base Set 58)"),
	"redblue.section0.wiki": () => sectionWikitext("Pokémon Red and Blue Versions", 0),
	"natdex.wiki": () => pageWikitext("List of Pokémon by National Pokédex number"),
};

await mkdir("test/fixtures", { recursive: true });
const only = process.argv.slice(2);
let failed = 0;
for (const [name, fn] of Object.entries(jobs)) {
	if (only.length && !only.includes(name)) continue;
	try {
		const text = await fn();
		await writeFile(`test/fixtures/${name}`, text);
		console.log(`${name}: ${text.length} chars`);
	} catch (e) {
		failed++;
		console.log(`${name}: FAILED ${e.message}`);
	}
}
process.exit(failed ? 1 : 0);
