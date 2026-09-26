import { GoogleLogo } from '@phosphor-icons/react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout.tsx'
import { Reveal } from '../components/Reveal.tsx'
import type { MeState } from '../lib/useMe.ts'

/* Real output of get_pokemon for Pikachu, trimmed to fit. */
const SAMPLE = `{
  "name": "Pikachu",
  "national_dex": 25,
  "types": ["Electric"],
  "category": "Mouse Pokémon",
  "abilities": { "regular": ["Static"], "hidden": "Lightning Rod" },
  "egg_groups": ["Field", "Fairy"],
  "catch_rate": 190,
  "base_stats": {
    "hp": 35, "attack": 55, "defense": 40,
    "sp_atk": 50, "sp_def": 50, "speed": 90, "total": 320
  },
  "artwork_url": "https://archives.bulbagarden.net/.../0025Pikachu.png"
}`

const CONFIG = `{
  "mcpServers": {
    "bulbapedia": {
      "url": "${typeof window !== 'undefined' ? window.location.origin : ''}/mcp",
      "headers": { "Authorization": "Bearer bp_your_token" }
    }
  }
}`

export function Landing({ me }: { me: MeState }) {
  const [params] = useSearchParams()
  if (me.loading) return null
  if (me.me) return <Navigate to="/dashboard" replace />
  const loginError = params.get('login_error')
  return (
    <Layout me={me} marketing>
      <section className="hero">
        <div className="hero-copy">
          <h1 className="display rise-in">Bulbapedia, readable by your AI assistant.</h1>
          <p className="lede rise-in d1">A remote MCP server that turns Bulbapedia into 33 structured tools for Claude and other MCP clients.</p>
          {loginError && <p className="alert">Sign-in was cancelled or failed. Try again.</p>}
          <a className="btn primary big rise-in d2" href="/auth/google">
            <GoogleLogo size={18} weight="bold" />
            Sign in with Google
          </a>
        </div>
        <figure className="sample rise-in d3" style={{ margin: 0 }}>
          <figcaption className="sample-head">
            <span>Response from get_pokemon</span>
            <span className="num">Pikachu, #25</span>
          </figcaption>
          <pre>{SAMPLE}</pre>
        </figure>
      </section>

      <Reveal as="section" className="section">
        <div className="section-head">
          <h2 className="title">Three steps to your first query</h2>
        </div>
        <div className="steps">
          <ol className="step-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            <li className="step">
              <span className="step-n">01</span>
              <div>
                <h3>Sign in</h3>
                <p>Google handles the login. We keep your email and name, nothing else from Google.</p>
              </div>
            </li>
            <li className="step">
              <span className="step-n">02</span>
              <div>
                <h3>Create a token</h3>
                <p>Pick a name and an expiry. The token is shown once and stored as a hash.</p>
              </div>
            </li>
            <li className="step">
              <span className="step-n">03</span>
              <div>
                <h3>Paste it into your client</h3>
                <p>Claude Code, Claude Desktop, Cursor, or anything that speaks MCP. Every call shows up on your dashboard.</p>
              </div>
            </li>
          </ol>
          <figure className="sample" style={{ margin: 0 }}>
            <figcaption className="sample-head">
              <span>MCP client configuration</span>
              <span>JSON</span>
            </figcaption>
            <pre>{CONFIG}</pre>
          </figure>
        </div>
      </Reveal>

      <Reveal as="section" className="section">
        <div className="section-head">
          <h2 className="title">What the tools cover</h2>
          <p className="lede">Structured JSON, parsed from Bulbapedia's own templates, fetched live and cached at the edge.</p>
        </div>
        <div className="bento">
          <div className="tile wide yellow">
            <h3>Pokémon</h3>
            <p>One call for the species, more for the detail.</p>
            <ul>
              <li>species data and base stats</li>
              <li>learnsets by generation</li>
              <li>evolution chains</li>
              <li>type matchups</li>
              <li>Pokédex entries</li>
              <li>game locations</li>
              <li>held items</li>
              <li>sprites and artwork</li>
            </ul>
          </div>
          <div className="tile blue">
            <h3>Moves and Abilities</h3>
            <p>Stats, effects, per-game descriptions, and reverse lookups: every Pokémon that learns a move or carries an Ability.</p>
          </div>
          <div className="tile green">
            <h3>Browse</h3>
            <p>By generation, type, egg group, legendary status, or any Bulbapedia category.</p>
          </div>
          <div className="tile wide">
            <h3>Other pages</h3>
            <p>Items, routes and towns with encounter tables and trainers, the 18 types, anime episodes, characters, TCG cards, and games.</p>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="section">
        <div className="prose">
          <h2 className="title">What gets logged</h2>
          <p>Each tool call is recorded with the tool name, its arguments, whether it succeeded, and how long it took, tied to the token that made it.</p>
          <p>You see your own history on the dashboard. The server admin sees everyone's. Tokens are stored as hashes, and expired tokens are deleted.</p>
        </div>
      </Reveal>

      <Reveal as="section" className="section">
        <div className="cta-band">
          <h2 className="title">Ready when you are.</h2>
          <a className="btn primary big" href="/auth/google">
            <GoogleLogo size={18} weight="bold" />
            Sign in with Google
          </a>
        </div>
      </Reveal>
    </Layout>
  )
}
