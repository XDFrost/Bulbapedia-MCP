import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { findSection, getCategories, getExtract, getSectionWikitext, getSections, pageUrl, resolveTitle } from "../bulbapedia/client.ts";
import { cleanWikitext } from "../wikitext/clean.ts";
import { json, notFound, safe, truncate } from "./shared.ts";

export function registerPageTools(server: McpServer) {
	server.registerTool(
		"get_page_summary",
		{
			title: "Get page summary",
			description: "Plain-text introduction of any Bulbapedia page (the text before the first heading) plus its lead image. Accepts loose titles like 'pikachu' or 'Thunder Stone'; redirects are followed.",
			inputSchema: z.object({ title: z.string().min(1).describe("Page title, e.g. 'Pikachu (Pokémon)' or just 'Pikachu'") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ title }) =>
			safe(async () => {
				const ex = await getExtract(title, true);
				if (!ex) return notFound("page", title);
				return json({ title: ex.title, url: pageUrl(ex.title), summary: ex.extract.trim(), image_url: ex.image });
			}),
	);

	server.registerTool(
		"get_page_sections",
		{
			title: "List page sections",
			description: "Outline of a Bulbapedia page: section index numbers, nesting level and headings. Use it to choose a section for get_page_section on long pages (a species page can have 100+ sections).",
			inputSchema: z.object({ title: z.string().min(1) }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ title }) =>
			safe(async () => {
				const canonical = await resolveTitle(title);
				if (!canonical) return notFound("page", title);
				const { sections } = await getSections(canonical);
				return json({ title: canonical, url: pageUrl(canonical), sections: sections.map((s) => ({ index: Number(s.index), level: s.level, heading: s.line })) });
			}),
	);

	server.registerTool(
		"get_page_section",
		{
			title: "Get page section text",
			description:
				"Readable plain text of one section of a Bulbapedia page, identified by section index (from get_page_sections) or heading text (e.g. 'Biology', 'Evolution', 'Game locations'). Subsections are included. Section 0 is the lead. Long sections are truncated at max_chars. Note: sections that are pure data tables on the wiki (Game locations, Learnset, Type effectiveness) are template-driven and come back mostly empty; use get_pokemon / get_move for that data.",
			inputSchema: z.object({
				title: z.string().min(1),
				section: z.union([z.number().int().min(0), z.string().min(1)]).describe("Section index number or heading text"),
				max_chars: z.number().int().min(500).max(50000).default(8000),
			}),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ title, section, max_chars }) =>
			safe(async () => {
				const canonical = await resolveTitle(title);
				if (!canonical) return notFound("page", title);
				let index: string;
				let heading: string;
				if (section === 0 || section === "0") {
					index = "0";
					heading = "(lead)";
				} else {
					const { sections } = await getSections(canonical);
					const found = findSection(sections, section);
					if (!found) {
						return { content: [{ type: "text", text: `No section "${section}" on "${canonical}". Available: ${sections.map((s) => s.line).join(", ")}` }], isError: true };
					}
					index = found.index;
					heading = found.line;
				}
				const wikitext = await getSectionWikitext(canonical, index);
				const { text, truncated } = truncate(cleanWikitext(wikitext), max_chars);
				return json({ title: canonical, section: heading, section_index: Number(index), url: pageUrl(canonical), truncated, text });
			}),
	);

	server.registerTool(
		"get_page_categories",
		{
			title: "Get page categories",
			description: "Categories a Bulbapedia page belongs to (e.g. 'Pokémon that evolve using Thunder Stone', 'Yellow-colored Pokémon'). Any of these can be passed to list_category_members to browse similar pages.",
			inputSchema: z.object({ title: z.string().min(1) }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ title }) =>
			safe(async () => {
				const r = await getCategories(title);
				if (!r) return notFound("page", title);
				return json({ title: r.title, url: pageUrl(r.title), categories: r.categories });
			}),
	);
}
