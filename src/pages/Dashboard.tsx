import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Bars } from '../components/Bars.tsx'
import { CopyBlock } from '../components/Copy.tsx'
import { Layout } from '../components/Layout.tsx'
import { Modal } from '../components/Modal.tsx'
import { SkeletonRows, SkeletonTiles } from '../components/Skeleton.tsx'
import { Tag } from '../components/Tag.tsx'
import { api, TTL_OPTIONS, type EventPage, type TokenRecord, type UsageSummary } from '../lib/api.ts'
import { fmtAgo, fmtArgs, fmtDate, fmtExpiry } from '../lib/format.ts'
import type { MeState } from '../lib/useMe.ts'

function snippets(token: string) {
  const url = `${window.location.origin}/mcp`
  return {
    claude: `claude mcp add --transport http bulbapedia ${url} --header "Authorization: Bearer ${token}"`,
    // Claude Desktop only launches local (stdio) servers, so it needs the mcp-remote bridge.
    // The token goes in env, not args: no spaces in args (a known Windows/Cursor bug) and it stays out of the process list.
    desktop: JSON.stringify(
      {
        mcpServers: {
          bulbapedia: {
            command: 'npx',
            args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH_HEADER}'],
            env: { AUTH_HEADER: `Bearer ${token}` },
          },
        },
      },
      null,
      2,
    ),
    http: JSON.stringify({ mcpServers: { bulbapedia: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
  }
}

export function Dashboard({ me }: { me: MeState }) {
  const [tokens, setTokens] = useState<TokenRecord[] | null>(null)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [events, setEvents] = useState<EventPage | null>(null)
  const [name, setName] = useState('')
  const [ttl, setTtl] = useState('30d')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [t, s, e] = await Promise.all([
      api<{ tokens: TokenRecord[] }>('/api/tokens'),
      api<UsageSummary>('/api/usage/summary?days=30'),
      api<EventPage>('/api/usage/events?limit=25'),
    ])
    setTokens(t.tokens)
    setSummary(s)
    setEvents(e)
  }, [])

  useEffect(() => {
    if (me.me) load().catch((e) => setError(String(e.message ?? e)))
  }, [me.me, load])

  if (me.loading) return null
  if (!me.me) return <Navigate to="/" replace />

  async function createToken(ev: FormEvent) {
    ev.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const r = await api<{ token: string }>('/api/tokens', { method: 'POST', json: { name, ttl } })
      setNewToken(r.token)
      setName('')
      await load()
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this token? Clients using it will stop working immediately.')) return
    await api(`/api/tokens/${id}`, { method: 'DELETE' })
    await load()
  }

  const active = (tokens ?? []).filter((t) => !t.revoked_at)
  const revoked = (tokens ?? []).filter((t) => t.revoked_at)

  return (
    <Layout me={me}>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title">Dashboard</h1>
        <span className="muted small">Signed in as {me.me.user.email}</span>
      </div>
      {error && <p className="alert">{error}</p>}
      <section className="card">
        <h2>Tokens</h2>
          <p className="muted">A token is a bearer credential for the MCP endpoint. Usage is logged per token, and expired tokens are deleted on their own.</p>
          <form className="row wrap" onSubmit={createToken}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="token-name">Name</label>
              <input id="token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Code on my laptop" maxLength={80} required />
            </div>
            <div className="field">
              <label htmlFor="token-ttl">Expires</label>
              <select id="token-ttl" value={ttl} onChange={(e) => setTtl(e.target.value)}>
                {TTL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label aria-hidden="true">&nbsp;</label>
              <button className="btn primary" disabled={creating || !name.trim()}>
                {creating ? 'Creating' : 'Create token'}
              </button>
            </div>
          </form>
          {tokens === null ? (
            <SkeletonRows rows={3} />
          ) : active.length === 0 ? (
            <div className="empty">
              <h3>No active tokens</h3>
              <p className="muted">Create one above, then:</p>
              <ol>
                <li>Copy the token from the dialog. It is shown once.</li>
                <li>Paste the Claude Code command, or the JSON config, into your client.</li>
                <li>Ask it something about Pokémon and watch the call appear here.</li>
              </ol>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>
                      <code>{t.token_prefix}</code>
                    </td>
                    <td className="nowrap">{fmtDate(t.created_at)}</td>
                    <td>{fmtAgo(t.last_used_at)}</td>
                    <td title={t.expires_at ? fmtDate(t.expires_at) : 'never'}>{fmtExpiry(t.expires_at)}</td>
                    <td className="right">
                      <button className="btn small danger" onClick={() => void revoke(t.id)}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {revoked.length > 0 && (
            <details>
              <summary className="muted small">{revoked.length} revoked</summary>
              <ul className="plain">
                {revoked.map((t) => (
                  <li key={t.id} className="muted small">
                    {t.name}, <code>{t.token_prefix}</code>, revoked {fmtDate(t.revoked_at)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="card">
          <h2>Usage, last 30 days</h2>
          {summary ? (
            <div className="two-col">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="tiles">
                <div className="tile-m">
                  <span className="tile-n">{summary.total_calls}</span>
                  <span className="tile-l">tool calls</span>
                </div>
                <div className="tile-m">
                  <span className="tile-n">{summary.error_calls}</span>
                  <span className="tile-l">errors</span>
                </div>
                <div className="tile-m">
                  <span className="tile-n">{summary.by_tool.length}</span>
                  <span className="tile-l">tools used</span>
                </div>
              </div>
              <Bars data={summary.by_day} />
              </div>
              {summary.by_tool.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th className="num">Calls</th>
                      <th className="num">Errors</th>
                      <th className="num">Avg ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_tool.map((t) => (
                      <tr key={t.tool}>
                        <td>
                          <code>{t.tool}</code>
                        </td>
                        <td className="num">{t.calls}</td>
                        <td className="num">{t.errors}</td>
                        <td className="num">{t.avg_ms ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">Per-tool counts appear after the first call.</p>
              )}
            </div>
          ) : (
            <SkeletonTiles />
          )}
        </section>

      <section className="card">
        <h2>Recent calls</h2>
        {events === null ? (
          <SkeletonRows rows={4} />
        ) : events.events.length ? (
          <table className="events">
            <thead>
              <tr>
                <th>When</th>
                <th>Tool</th>
                <th>Arguments</th>
                <th>Token</th>
                <th className="num">ms</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {events.events.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{fmtDate(e.created_at)}</td>
                  <td>
                    <code>{e.tool}</code>
                  </td>
                  <td className="args" title={e.error ?? fmtArgs(e.args)}>
                    {fmtArgs(e.args)}
                  </td>
                  <td>{e.token_name ?? 'none'}</td>
                  <td className="num">{e.duration_ms ?? '-'}</td>
                  <td>{e.ok ? <Tag tone="green">ok</Tag> : <Tag tone="red">error</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <h3>No calls yet</h3>
            <p className="muted">Connect a client with one of your tokens and ask it something about Pokémon. Calls appear here within a second.</p>
          </div>
        )}
      </section>

      {newToken && (
        <Modal title="Your new token" onClose={() => setNewToken(null)}>
          <p className="alert warn">Copy it now. It is stored as a hash and cannot be shown again.</p>
          <CopyBlock label="Token" text={newToken} />
          <CopyBlock label="Claude Code (run in a terminal)" text={snippets(newToken).claude} />
          <CopyBlock label="Claude Desktop (claude_desktop_config.json, via mcp-remote)" text={snippets(newToken).desktop} />
          <CopyBlock label="Cursor, Windsurf, or any client that supports HTTP servers with headers" text={snippets(newToken).http} />
        </Modal>
      )}
    </Layout>
  )
}
