// End-to-end check of the MCP tools against a running server, using the MCP SDK v1 client (same era as Claude Code).
// Usage: MCP_URL=http://localhost:8788/mcp MCP_TOKEN=<token> node scripts/verify-live.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL ?? "http://localhost:8788/mcp");
const token = process.env.MCP_TOKEN ?? "local-dev-token";
const client = new Client({ name: "verify", version: "0.0.0" });
const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
await client.connect(transport);

let failures = 0;
function check(label, ok, detail = "") {
	console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -> ${detail}` : ""}`);
	if (!ok) failures++;
}
async function call(name, args) {
	const t0 = Date.now();
	const r = await client.callTool({ name, arguments: args });
	const ms = Date.now() - t0;
	const text = r.content?.find((c) => c.type === "text")?.text ?? "";
	let data = r.structuredContent;
	if (!data) { try { data = JSON.parse(text); } catch { data = { text }; } }
	return { data, ms, isError: !!r.isError, text };
}

const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
console.log("tools:", names.join(", "));
check("33 tools registered", names.length === 33, String(names.length));
const templates = await client.listResourceTemplates();
check("resource template registered", templates.resourceTemplates.some((t) => t.uriTemplate === "bulbapedia://page/{title}"));

let r = await call("search_bulbapedia", { query: "Charizard" });
check("search: Charizard first", r.data.results?.[0]?.title === "Charizard (Pokémon)", `${r.data.results?.[0]?.title} (${r.ms}ms)`);
r = await call("search_bulbapedia", { query: "Char", mode: "prefix", limit: 5 });
check("prefix search returns titles", r.data.results?.length === 5, r.data.results?.map((x) => x.title).join(" | "));
r = await call("search_bulbapedia", { query: "Electric-type", namespace: "category", limit: 5 });
check("search: category namespace", r.data.results?.some((x) => /^Category:Electric-type/.test(x.title)));

r = await call("get_pokemon", { name: "pikachu" });
const p = r.data;
check("get_pokemon: dex 25 / Electric", p.national_dex === 25 && p.types?.[0] === "Electric", `${r.ms}ms`);
check("get_pokemon: hidden ability Lightning Rod", p.abilities?.hidden === "Lightning Rod");
check("get_pokemon: base stats speed 90 sp_def 50", p.base_stats?.speed === 90 && p.base_stats?.sp_def === 50, JSON.stringify(p.base_stats));
check("get_pokemon: artwork + sprite + icon urls", !!p.artwork_url && !!p.sprite_url && !!p.icon_url);
check("get_pokemon: stats_history has 3 blocks", p.stats_history?.length === 3);
const r2 = await call("get_pokemon", { name: "Pikachu (Pokémon)" });
check("get_pokemon: second call not slower (cache)", r2.ms <= r.ms + 50, `${r.ms}ms -> ${r2.ms}ms`);
r = await call("get_pokemon", { name: "Mr. Mime" });
check("get_pokemon: Mr. Mime resolves", r.data.national_dex === 122, `${r.data.name} ${r.data.national_dex}`);
r = await call("get_pokemon", { name: "Notapokemon" });
check("get_pokemon: unknown -> isError", r.isError, r.text.slice(0, 80));

r = await call("get_move", { name: "Thunderbolt" });
const m = r.data;
check("get_move: power 90 acc 100 pp 15 Electric", m.power === 90 && m.accuracy === 100 && m.pp === 15 && m.type === "Electric", `${r.ms}ms`);
check("get_move: effect mentions 10% paralysis", /10% chance/.test(m.effect ?? ""));
check("get_move: no leftover wikitext in effect", !/\{\{|\[\[/.test(m.effect ?? ""));
check("get_move: descriptions per game", m.descriptions?.length >= 8 && m.descriptions[0].games.includes("Stad"), `${m.descriptions?.length}`);

r = await call("get_ability", { name: "Static" });
const a = r.data;
check("get_ability: gen 3, 7+ descriptions", a.generation === 3 && a.descriptions?.length >= 7, `${a.descriptions?.length} descriptions, ${r.ms}ms`);
check("get_ability: effect text present", typeof a.effect === "string" && a.effect.length > 100 && !/\{\{/.test(a.effect));

r = await call("get_page_summary", { title: "Thunder Stone" });
check("get_page_summary: Thunder Stone", /Thunder Stone/.test(r.data.summary ?? ""), `${r.data.title} (${r.ms}ms)`);
r = await call("get_page_sections", { title: "Pikachu" });
check("get_page_sections: 100+ sections", r.data.sections?.length > 100, `${r.data.sections?.length}`);
r = await call("get_page_section", { title: "Pikachu", section: "Biology" });
check("get_page_section: Biology cleaned", r.data.text?.includes("Pikachu is a short, chubby rodent") && !r.data.text.includes("{{"), `${r.data.text?.length} chars`);
r = await call("get_page_section", { title: "Pikachu", section: "Biology", max_chars: 1500 });
check("get_page_section: truncation flag", r.data.truncated === true && r.data.text.includes("[truncated"), `${r.data.text?.length} chars`);
r = await call("get_page_categories", { title: "Pikachu" });
check("get_page_categories: includes Electric-type", r.data.categories?.includes("Electric-type Pokémon"), `${r.data.categories?.length} cats`);

r = await call("list_pokemon", { generation: 1 });
check("list_pokemon gen1: total 151, Bulbasaur first", r.data.total === 151 && r.data.results?.[0]?.name === "Bulbasaur", `${r.ms}ms`);
r = await call("list_pokemon", { generation: 1, limit: 200 });
check("list_pokemon gen1: Mew last", r.data.results?.[150]?.name === "Mew");
r = await call("list_pokemon", { generation: 1, type: "electric" });
check("list_pokemon gen1 electric: 9 incl. Zapdos", r.data.total === 9 && r.data.results.some((x) => x.name === "Zapdos"));
r = await call("list_pokemon", { egg_group: "Field", generation: 2, limit: 5 });
check("list_pokemon field+gen2: paged", r.data.total > 5 && r.data.next_offset === 5 && r.data.count === 5, `total ${r.data.total}, ${r.ms}ms`);
r = await call("list_pokemon", { legendary: "mythical", limit: 100 });
check("list_pokemon mythical includes Mew", r.data.results?.some((x) => x.name === "Mew"), `total ${r.data.total}`);
r = await call("list_pokemon", { generation: 7, include_forms: true, limit: 200 });
check("list_pokemon include_forms adds form rows", r.data.results?.some((x) => x.form), `total ${r.data.total}`);
r = await call("list_pokemon", { generation: 1, type: "Electric", include_images: true });
check("list_pokemon include_images: sprite urls", r.data.results?.every((x) => x.sprite_url && x.icon_url), `${r.ms}ms`);
r = await call("list_pokemon", { type: "Plastic" });
check("list_pokemon bad type -> isError", r.isError);

r = await call("get_pokemon_by_dex_number", { number: 150 });
check("dex 150 = Mewtwo Psychic", r.data.name === "Mewtwo" && r.data.types?.[0] === "Psychic", `${r.ms}ms`);
r = await call("get_pokemon_by_dex_number", { number: 19 });
check("dex 19 has Alolan form", r.data.forms?.some((f) => f.form === "Alolan Form"));
r = await call("get_pokemon_by_dex_number", { number: 25 });
check("dex number: sprite/icon/artwork urls", !!r.data.sprite_url && !!r.data.icon_url && !!r.data.artwork_url);
r = await call("get_pokemon_by_dex_number", { number: 6, full: true });
check("dex 6 full -> Charizard details", r.data.details?.abilities?.regular?.[0] === "Blaze", `${r.ms}ms`);

r = await call("list_moves", { type: "Fire", category: "physical" });
const mv = r.data.results?.map((x) => x.name) ?? [];
check("list_moves fire physical: Flare Blitz in, Flamethrower out", mv.includes("Flare Blitz") && !mv.includes("Flamethrower"), `${mv.length} moves`);
r = await call("list_abilities", { generation: 3 });
const ab = r.data.results?.map((x) => x.name) ?? [];
check("list_abilities gen3: Static & Levitate", ab.includes("Static") && ab.includes("Levitate"), `${ab.length} abilities`);
r = await call("list_category_members", { category: "Pokémon that evolve using Thunder Stone" });
const cm = r.data.results?.map((x) => x.title) ?? [];
check("list_category_members thunder stone: Pikachu & Eevee", cm.includes("Pikachu (Pokémon)") && cm.includes("Eevee (Pokémon)"));

// ---- species extras
r = await call("get_pokemon_learnset", { name: "Pikachu", method: "level_up" });
check("learnset latest: Thunder Wave lvl 4", r.data.level_up?.some((x) => x.move === "Thunder Wave" && x.level === 4), `${r.data.level_up?.length} moves, ${r.ms}ms`);
r = await call("get_pokemon_learnset", { name: "Pikachu", generation: 3 });
check("learnset gen3: tutor Body Slam + prevo Charm", r.data.tutor?.some((x) => x.move === "Body Slam") && r.data.prevolution?.some((x) => x.move === "Charm"));
r = await call("get_type_effectiveness", { name: "Charizard" });
check("type eff: Charizard 4x Rock, immune Ground", r.data.multipliers?.Rock === 4 && r.data.immunities?.includes("Ground"));
r = await call("get_evolution_chain", { name: "eevee" });
check("evolution: Eevee 9 stages, methods paired", r.data.stages?.length === 9 && r.data.stages.find((s) => s.name === "Leafeon")?.method?.includes("Moss Rock") && !r.data.methods_in_order, `${r.ms}ms`);
r = await call("get_evolution_chain", { name: "Pichu" });
check("evolution: Pichu chain has Alolan Raichu", r.data.stages?.some((s) => s.form === "Alolan Form"));
r = await call("get_pokedex_entries", { name: "Bulbasaur" });
check("dex entries: Bulbasaur Red/Blue text + Kanto #1", r.data.entries?.some((e) => e.games.includes("Red") && /seed/i.test(e.text)) && r.data.regional_dex_numbers?.some((x) => x.region === "Kanto" && x.number === 1));
r = await call("get_pokemon_locations", { name: "Pikachu", max_events: 5 });
check("locations: Viridian Forest in Red, events capped", r.data.locations?.some((l) => l.games.includes("Red") && /Viridian Forest/.test(l.area)) && r.data.events?.length === 5, `${r.data.events_total} events`);
r = await call("get_pokemon_held_items", { name: "Pikachu" });
check("held items: Light Ball", r.data.held_items?.some((g) => g.items.some((i) => i.item === "Light Ball")));
r = await call("get_names_in_other_languages", { title: "Pikachu" });
check("names: Japanese ピカチュウ", r.data.names?.some((n) => n.code === "ja" && n.name.includes("ピカチュウ")));
r = await call("get_names_in_other_languages", { title: "Thunder Stone" });
check("names: item langtable French", r.data.names?.some((n) => n.code === "fr" && /Pierre Foudre/.test(n.name)));
r = await call("get_pokemon_sprites", { name: "Pikachu", shiny: false });
check("sprites: artwork + HOME + menu + gen1 sprite, no shiny", !!r.data.artwork_url && !!r.data.home_render_url && !!r.data.menu_icon_url && r.data.sprites?.some((s) => s.generation === 1 && s.url) && !r.data.sprites?.some((s) => s.shiny), `${r.data.sprites?.length} sprites, ${r.ms}ms`);

// ---- move / ability extras
r = await call("get_move_learners", { name: "Thunderbolt", method: "level_up", limit: 5 });
check("move learners: Pikachu VII-2=21", r.data.learners?.[0]?.name === "Pikachu" && r.data.learners[0].by_generation["VII-2"] === "21", `total ${r.data.total}`);
r = await call("get_move_learners", { name: "Thunderbolt", method: "breeding" });
check("move learners: breeding includes Mareep", r.data.learners?.some((l) => l.name === "Mareep"));
r = await call("get_ability_pokemon", { name: "Levitate" });
check("ability pokemon: Levitate includes Bronzong", r.data.pokemon?.some((x) => x.name === "Bronzong"), `${r.data.total} holders`);
r = await call("get_ability_pokemon", { name: "static" });
check("ability pokemon: Static Pikachu first slot", r.data.pokemon?.[0]?.name === "Pikachu" && r.data.pokemon[0].slot === "first");

// ---- other page types
r = await call("get_item", { name: "Leftovers" });
check("get_item: Leftovers", r.data.name === "Leftovers" && r.data.generation === 2 && /HP/.test(r.data.effect ?? "") && !!r.data.icon_url, `${r.ms}ms`);
r = await call("get_item", { name: "thunder stone" });
check("get_item: lowercase resolves, prices + fling", r.data.prices?.length > 0 && r.data.fling_power === 30);
r = await call("get_location", { name: "Viridian Forest", max_encounters: 10 });
check("get_location: Viridian Forest", r.data.region === "Kanto" && r.data.encounters_total > 40 && r.data.encounters.length === 10 && r.data.trainers?.length > 5, `${r.ms}ms`);
r = await call("get_location", { name: "Kanto Route 1" });
check("get_location: route connections", r.data.connections?.north === "Viridian City");
r = await call("get_location", { name: "Pallet Town" });
check("get_location: town", r.data.name === "Pallet Town" && r.data.connections?.north === "Route 1");
r = await call("get_type", { type: "fire", include_pokemon: false });
check("get_type: Fire matchups + Flamethrower", r.data.offensive?.super_effective?.includes("Grass") && r.data.moves?.some((x) => x.move === "Flamethrower" && x.power === 90), `${r.ms}ms`);
r = await call("get_episode", { code: "ep1" });
check("get_episode: EP001 normalised, Ash in cast", r.data.code === "EP001" && r.data.title_en?.includes("I Choose You") && r.data.characters?.humans?.includes("Ash"));
r = await call("get_episode", { code: "JN042" });
check("get_episode: JN042", r.data.code === "JN042" && !!r.data.title_en, r.data.title_en);
r = await call("get_character", { name: "Ash Ketchum" });
check("get_character: Ash", r.data.name === "Ash Ketchum" && r.data.profile?.age === "10" && !!r.data.anime);
r = await call("get_character", { name: "Cynthia" });
check("get_character: Cynthia", /Cynthia/.test(r.data.name ?? "") && !!r.data.intro, r.data.page_title);
r = await call("get_tcg_card", { title: "Pikachu (Base Set 58)" });
check("get_tcg_card: Pikachu Base Set 58", r.data.name === "Pikachu" && r.data.attacks?.[0]?.name === "Gnaw" && !!r.data.image_url);
r = await call("get_game", { name: "Pokémon Scarlet and Violet" });
check("get_game: SV", /Scarlet/.test(r.data.name ?? "") && Object.keys(r.data.release_dates ?? {}).length > 0, r.data.platform);

// ---- meta
r = await call("get_file_urls", { files: ["HOME0025.png", "Spr 1b 025.png", "Nope_Not_A_File.png"] });
check("get_file_urls: 2 resolved, 1 missing", r.data.files?.filter((f) => f.url).length === 2 && r.data.files.some((f) => f.url === null));
r = await call("get_recent_changes", { limit: 5 });
check("get_recent_changes: 5 entries", r.data.changes?.length === 5 && !!r.data.changes[0].timestamp, r.data.changes?.[0]?.title);
r = await call("get_page_history", { title: "Pikachu", limit: 3 });
check("get_page_history: 3 revisions", r.data.revisions?.length === 3 && r.data.title === "Pikachu (Pokémon)");

const res = await client.readResource({ uri: "bulbapedia://page/Pikachu" });
check("resource read", /Pikachu/.test(res.contents?.[0]?.text ?? ""));

await client.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
