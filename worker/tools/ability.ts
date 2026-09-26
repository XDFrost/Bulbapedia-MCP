import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { findSection, getSectionWikitext, getSections, pageUrl, resolveEntity } from "../bulbapedia/client.ts";
import { parseAbilityInfobox } from "../parsers/ability.ts";
import { parseAbilityPokemon } from "../parsers/ability-extra.ts";
import { cleanWikitext } from "../wikitext/clean.ts";
import { json, notFound, safe, truncate } from "./shared.ts";

export function registerAbilityTools(server: McpServer) {
	server.registerTool(
		"get_ability",
		{
			title: "Get Ability",
			description: "Structured data for one Ability from Bulbapedia: generation introduced, in-game descriptions for every generation, and the 'Effect' section describing its in-battle and overworld mechanics.",
			inputSchema: z.object({ name: z.string().min(1).describe("Ability name, e.g. 'Static' or 'Levitate'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const title = await resolveEntity(name, "Ability");
				if (!title) return notFound("Ability", name);
				const [lead, { sections }] = await Promise.all([getSectionWikitext(title, 0), getSections(title)]);
				const info = parseAbilityInfobox(lead);
				if (!info) return notFound("Ability", name);
				const effectSection = findSection(sections, "Effect");
				let effect: string | null = null;
				if (effectSection) effect = truncate(cleanWikitext(await getSectionWikitext(title, effectSection.index)), 4000).text;
				const { raw_params, ...fields } = info;
				return json({ ...fields, effect, url: pageUrl(title), page_title: title, raw_params });
			}),
	);

	server.registerTool(
		"get_ability_pokemon",
		{
			title: "Get Pokémon with an Ability",
			description: "Every Pokémon (including regional forms) that can have an Ability, with dex number, types, whether it is the first, second or hidden Ability, and the Pokémon's other Abilities.",
			inputSchema: z.object({ name: z.string().min(1).describe("Ability name, e.g. 'Static'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const title = await resolveEntity(name, "Ability");
				if (!title) return notFound("Ability", name);
				const abilityName = title.replace(/ \(Ability\)$/, "");
				const { sections } = await getSections(title);
				const sec = sections.find((s) => /^Pokémon with /i.test(s.line)) ?? findSection(sections, "Pokémon");
				if (!sec) return { content: [{ type: "text", text: `No Pokémon list section on ${title}.` }], isError: true };
				const holders = parseAbilityPokemon(await getSectionWikitext(title, sec.index), abilityName);
				return json({ ability: abilityName, url: pageUrl(title), total: holders.length, pokemon: holders });
			}),
	);
}
