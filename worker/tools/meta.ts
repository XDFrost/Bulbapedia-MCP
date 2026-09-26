import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { NAMESPACES, pageHistory, pageUrl, recentChanges } from "../bulbapedia/client.ts";
import { fileUrls } from "../bulbapedia/images.ts";
import { json, notFound, safe } from "./shared.ts";

export function registerMetaTools(server: McpServer) {
	server.registerTool(
		"get_file_urls",
		{
			title: "Get file URLs",
			description: "Direct image URLs (and dimensions) for Bulbagarden Archives file names you already know, e.g. 'HOME0025.png', 'Spr 1b 025.png', 'Bag Thunder Stone Sprite.png'. Up to 50 per call; missing files return url null. Files cannot be searched, so get names from get_pokemon_sprites or page content.",
			inputSchema: z.object({ files: z.array(z.string().min(1)).min(1).max(50) }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ files }) => safe(async () => json({ files: await fileUrls(files) })),
	);

	server.registerTool(
		"get_recent_changes",
		{
			title: "Get recent changes",
			description: "Most recent human edits to Bulbapedia articles: page, editor, timestamp, edit summary and size change. Useful for 'what changed recently' questions.",
			inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(25), namespace: z.enum(Object.keys(NAMESPACES) as [string, ...string[]]).default("main") }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ limit, namespace }) =>
			safe(async () => {
				const changes = await recentChanges(limit, NAMESPACES[namespace]);
				return json({ namespace, changes: changes.map((c) => ({ ...c, url: pageUrl(c.title) })) });
			}),
	);

	server.registerTool(
		"get_page_history",
		{
			title: "Get page history",
			description: "Recent revisions of a Bulbapedia page: revision id, editor, timestamp, edit summary and page size.",
			inputSchema: z.object({ title: z.string().min(1), limit: z.number().int().min(1).max(50).default(10) }),
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ title, limit }) =>
			safe(async () => {
				const h = await pageHistory(title, limit);
				if (!h) return notFound("page", title);
				return json({ title: h.title, url: pageUrl(h.title), revisions: h.revisions });
			}),
	);
}
