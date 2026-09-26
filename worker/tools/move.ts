import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { findSection, getSectionWikitext, getSections, pageUrl, resolveEntity } from "../bulbapedia/client.ts";
import { parseMoveInfobox } from "../parsers/move.ts";
import { parseMoveDescriptions, parseMoveLearners } from "../parsers/move-extra.ts";
import { cleanWikitext } from "../wikitext/clean.ts";
import { json, notFound, safe, truncate } from "./shared.ts";

export function registerMoveTools(server: McpServer) {
	server.registerTool(
		"get_move",
		{
			title: "Get move",
			description:
				"Structured data for one move from Bulbapedia: type, damage category, power, accuracy, PP, generation introduced, contact/Protect/Snatch/etc. flags, TM/TR numbers per generation, in-game descriptions per game, and the full 'Effect' section text describing its mechanics by generation.",
			inputSchema: z.object({ name: z.string().min(1).describe("Move name, e.g. 'Thunderbolt'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name }) =>
			safe(async () => {
				const title = await resolveEntity(name, "move");
				if (!title) return notFound("move", name);
				const [lead, { sections }] = await Promise.all([getSectionWikitext(title, 0), getSections(title)]);
				const info = parseMoveInfobox(lead);
				if (!info) return notFound("move", name);
				const effectSection = findSection(sections, "Effect");
				const descSection = findSection(sections, "Description");
				const [effectWiki, descWiki] = await Promise.all([
					effectSection ? getSectionWikitext(title, effectSection.index) : Promise.resolve(null),
					descSection ? getSectionWikitext(title, descSection.index) : Promise.resolve(null),
				]);
				const effect = effectWiki ? truncate(cleanWikitext(effectWiki), 4000).text : null;
				const descriptions = descWiki ? parseMoveDescriptions(descWiki) : [];
				const { raw_params, ...fields } = info;
				return json({ ...fields, effect, descriptions, url: pageUrl(title), page_title: title, raw_params });
			}),
	);

	server.registerTool(
		"get_move_learners",
		{
			title: "Get Pokémon that learn a move",
			description:
				"Every Pokémon that can learn a move, grouped by method (level_up, tm, breeding, tutor, special, champions), with dex number, types, egg groups and the level or mark per generation column (e.g. 'VII-2' is the second Generation VII game group). Filter with method; paginate with limit/offset.",
			inputSchema: z.object({
				name: z.string().min(1).describe("Move name"),
				method: z.enum(["all", "level_up", "tm", "breeding", "tutor", "special", "champions"]).default("all"),
				limit: z.number().int().min(1).max(500).default(100),
				offset: z.number().int().min(0).default(0),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ name, method, limit, offset }) =>
			safe(async () => {
				const title = await resolveEntity(name, "move");
				if (!title) return notFound("move", name);
				const { sections } = await getSections(title);
				const sec = findSection(sections, "Learnset");
				if (!sec) return { content: [{ type: "text", text: `No Learnset section on ${title}.` }], isError: true };
				let learners = parseMoveLearners(await getSectionWikitext(title, sec.index));
				if (method !== "all") learners = learners.filter((l) => l.method === method);
				const slice = learners.slice(offset, offset + limit);
				return json({ move: title, url: pageUrl(title), method, total: learners.length, offset, count: slice.length, next_offset: offset + limit < learners.length ? offset + limit : null, learners: slice });
			}),
	);
}
