import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { getExtract, pageUrl } from "./bulbapedia/client.ts";
import { registerAbilityTools } from "./tools/ability.ts";
import { registerListTools } from "./tools/lists.ts";
import { registerMetaTools } from "./tools/meta.ts";
import { registerMoveTools } from "./tools/move.ts";
import { registerPageTools } from "./tools/page.ts";
import { registerPageTypeTools } from "./tools/pages.ts";
import { registerPokemonExtraTools } from "./tools/pokemon-extra.ts";
import { registerPokemonTools } from "./tools/pokemon.ts";
import { registerSearchTools } from "./tools/search.ts";
import { wrapToolRegistration } from "./usage.ts";

export const SERVER_NAME = "bulbapedia";
export const SERVER_VERSION = "0.2.0";

/** Build a fresh McpServer with every Bulbapedia tool registered. Called once per request. */
export function createServer(): McpServer {
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION, title: "Bulbapedia" },
		{
			instructions:
				"Tools for reading Bulbapedia, the community Pokémon encyclopedia. Use search_bulbapedia to find pages; get_pokemon / get_move / get_ability / get_item / get_location / get_type / get_episode / get_character / get_tcg_card / get_game for structured data; get_pokemon_learnset, get_evolution_chain, get_type_effectiveness, get_pokedex_entries, get_pokemon_locations, get_pokemon_sprites for species detail; get_move_learners and get_ability_pokemon for reverse lookups; list_* tools to browse by generation, type, egg group or category; and get_page_section for any other article content. All data is fetched live from Bulbapedia's public API and is licensed CC BY-NC-SA 2.5.",
		},
	);
	wrapToolRegistration(server);

	registerSearchTools(server);
	registerPageTools(server);
	registerPokemonTools(server);
	registerMoveTools(server);
	registerAbilityTools(server);
	registerListTools(server);
	registerPokemonExtraTools(server);
	registerPageTypeTools(server);
	registerMetaTools(server);

	server.registerResource(
		"bulbapedia-page",
		new ResourceTemplate("bulbapedia://page/{title}", { list: undefined }),
		{ title: "Bulbapedia page summary", description: "Introduction of a Bulbapedia page by title", mimeType: "text/plain" },
		async (uri, variables) => {
			const raw = variables.title;
			const title = decodeURIComponent(Array.isArray(raw) ? raw[0] : String(raw));
			const ex = await getExtract(title, true);
			if (!ex) throw new Error(`No Bulbapedia page "${title}"`);
			return { contents: [{ uri: uri.href, mimeType: "text/plain", text: `${ex.title}\n${pageUrl(ex.title)}\n\n${ex.extract.trim()}` }] };
		},
	);

	return server;
}
