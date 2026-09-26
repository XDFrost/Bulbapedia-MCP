# bulbapedia-mcp

A remote [MCP](https://modelcontextprotocol.io) server that gives Claude (and any other MCP client)
structured access to [Bulbapedia](https://bulbapedia.bulbagarden.net), the community Pokémon
encyclopedia. It runs on Cloudflare Workers as a stateless Streamable HTTP server: no Durable Objects,
no sessions, and every request is served from Bulbapedia's public MediaWiki API with edge caching.

Content is fetched live from Bulbapedia and is licensed
[CC BY-NC-SA 2.5](https://bulbapedia.bulbagarden.net/wiki/Bulbapedia:Copyrights). Only the API
endpoint (`/w/api.php`) is used; HTML pages are never scraped.

## Tools

**Search and pages**

| Tool | What it does |
| --- | --- |
| `search_bulbapedia` | Full-text search or title autocomplete; `namespace` switches to files or categories |
| `get_page_summary` | Lead paragraph and image of any page |
| `get_page_sections` | Section outline of a page |
| `get_page_section` | Plain text of one section (by index or heading) |
| `get_page_categories` | Categories a page belongs to |
| `get_names_in_other_languages` | Names of any subject in other languages, with origins |

**Pokémon**

| Tool | What it does |
| --- | --- |
| `get_pokemon` | Species data: dex number, types, abilities, egg groups, base stats, forms, artwork, HOME render, icon |
| `get_pokemon_learnset` | Level-up, TM, breeding, tutor, pre-evolution and event moves; any generation |
| `get_type_effectiveness` | Defensive matchups with weaknesses, resistances, immunities |
| `get_evolution_chain` | Every stage with method, including branched families |
| `get_pokedex_entries` | Flavor text per game plus regional dex numbers |
| `get_pokemon_locations` | Where to obtain it in each game, plus event distributions |
| `get_pokemon_held_items` | Wild held items with chances |
| `get_pokemon_sprites` | Artwork, HOME render, menu icon and every game sprite with URLs |
| `list_pokemon` | Browse by generation, type, egg group, legendary/mythical; optional images |
| `get_pokemon_by_dex_number` | Look up by National Dex number |

**Moves and Abilities**

| Tool | What it does |
| --- | --- |
| `get_move` | Type, category, power, accuracy, PP, flags, TM numbers, per-game descriptions, effect text |
| `get_move_learners` | Every Pokémon that learns a move, by method and generation |
| `list_moves` | Browse by type, damage category, generation |
| `get_ability` | Generation, per-generation descriptions, effect text |
| `get_ability_pokemon` | Every Pokémon with an Ability and in which slot |
| `list_abilities` | Browse, optionally by generation |

**Other page types**

| Tool | What it does |
| --- | --- |
| `get_item` | Pockets, prices, fling power, descriptions, effect, acquisition |
| `get_location` | Region, map description, connections, encounter tables, items, trainers |
| `get_type` | Matchups, average stats, Pokémon lists, all moves of the type, abilities |
| `get_episode` | Anime episode: titles, air dates, plot, major events, characters |
| `get_character` | Profile, anime/game/manga appearances, teams |
| `get_tcg_card` | TCG card prints, attacks, Pokédex data, card text |
| `get_game` | Platform, developer, release dates, ratings |
| `list_category_members` | Any Bulbapedia category, with pagination |

**Wiki meta**

| Tool | What it does |
| --- | --- |
| `get_file_urls` | Direct URLs and sizes for up to 50 image files |
| `get_recent_changes` | Latest article edits |
| `get_page_history` | Recent revisions of a page |

A `bulbapedia://page/{title}` resource template returns a page's introduction.

## How it works

```
Browser (React app, served by the Worker)
   │  /auth/google → Google sign-in (OAuth 2.0 + PKCE, owned by the Worker) → session cookie
   │  /api/*  tokens, usage, admin (session cookie)
   ▼
Cloudflare Worker (Hono)
   /mcp      bearer = personal token (bp_…) → every tool call logged to usage_events
   /api/*    ── Postgres (Supabase) via Hyperdrive ──┐
   /auth/*                                            │  users, sessions, api_tokens, usage_events
   /*        static assets (Vite build)               └──────────────────────────────────────────
```

- Users sign in with Google, create personal bearer tokens on the dashboard, and see their own usage.
- Admins (`users.is_admin`) see every user, every token, and a filterable event log at `/admin`.
- The browser never talks to the database; all reads and writes go through the Worker.
- Tokens are stored as SHA-256 hashes and shown once. Each token has an expiry chosen at creation (1 hour to 1 year, or never).
  Expired tokens are rejected immediately and deleted: when presented, when their owner opens the token list, and by a
  Cron Trigger every 6 hours (which also keeps a free Supabase project from pausing). Usage rows keep the token's name.
- Sessions are HttpOnly cookies backed by a `sessions` table.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # SESSION_SECRET, DEV_LOGIN_SECRET, optional MCP_AUTH_TOKEN
npm run db:start                  # embedded Postgres on 127.0.0.1:54329 (+ migrations)
npm run dev                       # http://localhost:8788  (Vite + Worker in one dev server)
```

Sign in locally without Google: open `http://localhost:8788/auth/dev-login?secret=dev-login&email=you@example.com&name=You&admin=1`
(only works while `DEV_LOGIN_SECRET` is set in `.dev.vars`; never set it in production).

Tests and checks:

```bash
npm test                          # parser + auth unit tests (fixtures, no network)
npm run verify:live               # every MCP tool against the running server (MCP_TOKEN=local-dev-token)
npm run verify:accounts           # login, tokens, /mcp with a user token, usage log, admin routes
npm run fixtures                  # refresh test fixtures from the live Bulbapedia API
npm run db:stop
```

## Deploy

### 1. Supabase (Postgres)

1. Create a project at supabase.com.
2. SQL editor → paste and run every file in `db/migrations/` in order (`0001_init.sql`, `0002_token_expiry.sql`).
3. Project settings → Database → copy the **Session pooler** connection string (IPv4 compatible), e.g.
   `postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.

### 2. Hyperdrive (Cloudflare's connection pooler for Postgres)

```bash
npx wrangler login
npx wrangler hyperdrive create bulbapedia-db --connection-string="<session pooler string>"
```

Paste the printed `id` into `wrangler.jsonc` → `hyperdrive[0].id`.

### 3. Google OAuth client

1. console.cloud.google.com → APIs & Services → OAuth consent screen (External). While it is in "Testing", only listed test users can sign in; publish it to open sign-in to everyone.
2. Credentials → Create credentials → OAuth client ID → Web application.
3. Authorized redirect URIs: `http://localhost:8788/auth/callback` and `https://bulbapedia-mcp.<your-subdomain>.workers.dev/auth/callback`.
4. Put the client id in `wrangler.jsonc` → `vars.GOOGLE_CLIENT_ID`. Optionally set `vars.BOOTSTRAP_ADMIN_EMAIL` to your Google email so your first login becomes admin.

### 4. Secrets and deploy

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET        # any 32+ random characters, e.g. openssl rand -base64 32
npm run deploy                                # builds the app + worker, then wrangler deploy
```

The app is at `https://bulbapedia-mcp.<your-subdomain>.workers.dev`; the MCP endpoint is `/mcp`. Do **not** set `DEV_LOGIN_SECRET` or `MCP_AUTH_TOKEN` in production.

To make someone admin later: Supabase table editor → `users` → set `is_admin = true`, or use the toggle on the admin page.

## Connect a client

Create a token on the dashboard; it shows ready-to-paste snippets. Claude Code:

```bash
claude mcp add --transport http bulbapedia https://bulbapedia-mcp.<your-subdomain>.workers.dev/mcp --header "Authorization: Bearer bp_..."
```

Generic JSON config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "bulbapedia": {
      "url": "https://bulbapedia-mcp.<your-subdomain>.workers.dev/mcp",
      "headers": { "Authorization": "Bearer bp_..." }
    }
  }
}
```

## Design system

The web app follows the project's `minimalist-ui` skill: warm monochrome palette (`#F7F6F3` canvas, `#111` ink, `#EAEAEA` hairlines,
warm dark equivalents under `prefers-color-scheme: dark`), Newsreader for display headings, Geist for UI text, Geist Mono for
numbers and code, muted pastels only for status tags, 12px cards, 6px controls, no gradients or shadows. Fonts are self-hosted
via Fontsource; icons come from Phosphor (bold weight). Tokens live at the top of `src/index.css`.

## Layout

```
worker/index.ts         Hono app: /health, /auth/*, /api/*, /mcp; static assets for everything else
worker/server.ts        McpServer factory; registers all tools and the page resource
worker/auth.ts          Bearer gate for /mcp (per-user tokens, optional legacy MCP_AUTH_TOKEN)
worker/auth/            Google OAuth (PKCE), sessions, token generation, crypto helpers
worker/routes/          /auth and /api (+ /api/admin) route handlers
worker/db/              postgres.js client (via Hyperdrive) and typed queries
worker/usage.ts         Logs every tool call to usage_events
worker/bulbapedia/      Bulbapedia API client (Cache API), categories, dex index, images
worker/parsers/         Pure wikitext → JSON parsers for infoboxes, learnsets, evolution, pages…
worker/wikitext/        Template extraction and wikitext-to-plain-text cleaning
worker/tools/           One file per tool group
src/                    React app (Vite): landing, dashboard, admin
db/migrations/          SQL schema (run in Supabase)
test/                   Vitest: parser tests against captured fixtures, auth unit tests
scripts/                fixtures capture, local Postgres, end-to-end verification
```

## Notes

- Responses from Bulbapedia are cached at the edge for 1 hour (24 hours for the National Dex index).
- Bulbapedia's HTML pages sit behind a bot challenge. This server never requests them; if the API
  itself ever starts challenging requests, tools return an error rather than attempting a bypass.
- Tool arguments are stored in the usage log, so admins can see what users looked up. The landing page says so.
