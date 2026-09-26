import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bars } from '../components/Bars.tsx'
import { Layout } from '../components/Layout.tsx'
import { Modal } from '../components/Modal.tsx'
import { SkeletonRows, SkeletonTiles } from '../components/Skeleton.tsx'
import { Tag } from '../components/Tag.tsx'
import { api, type AdminSummary, type AdminUser, type EventPage, type TokenRecord, type UsageSummary } from '../lib/api.ts'
import { fmtAgo, fmtArgs, fmtDate, fmtExpiry, pct } from '../lib/format.ts'
import type { MeState } from '../lib/useMe.ts'

interface UserDetail {
  user: AdminUser
  tokens: TokenRecord[]
  usage: UsageSummary
}

export function Admin({ me }: { me: MeState }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [events, setEvents] = useState<EventPage | null>(null)
  const [filterUser, setFilterUser] = useState('')
  const [filterTool, setFilterTool] = useState('')
  const [offset, setOffset] = useState(0)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const limit = 50

  const loadTop = useCallback(async () => {
    const [s, u] = await Promise.all([api<AdminSummary>('/api/admin/summary?days=30'), api<{ users: AdminUser[] }>('/api/admin/users')])
    setSummary(s)
    setUsers(u.users)
  }, [])

  const loadEvents = useCallback(async () => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (filterUser) q.set('user_id', filterUser)
    if (filterTool) q.set('tool', filterTool)
    setEvents(await api<EventPage>(`/api/admin/events?${q}`))
  }, [filterUser, filterTool, offset])

  useEffect(() => {
    if (me.me?.is_admin) loadTop().catch((e) => setError(String(e.message ?? e)))
  }, [me.me, loadTop])
  useEffect(() => {
    if (me.me?.is_admin) loadEvents().catch((e) => setError(String(e.message ?? e)))
  }, [me.me, loadEvents])

  if (me.loading) return null
  if (!me.me) return <Navigate to="/" replace />
  if (!me.me.is_admin) {
    return (
      <Layout me={me}>
        <div className="prose" style={{ paddingTop: 16 }}>
          <h1 className="title">Admins only</h1>
          <p>Your account does not have admin access. Ask the person who runs this server.</p>
        </div>
      </Layout>
    )
  }

  async function openUser(id: string) {
    setDetail(await api<UserDetail>(`/api/admin/users/${id}?days=30`))
  }
  async function revokeToken(id: string) {
    if (!confirm('Revoke this token?')) return
    await api(`/api/admin/tokens/${id}/revoke`, { method: 'POST' })
    if (detail) await openUser(detail.user.id)
    await loadTop()
  }
  async function toggleAdmin(u: AdminUser, isAdmin: boolean) {
    await api(`/api/admin/users/${u.id}`, { method: 'POST', json: { is_admin: isAdmin } })
    await loadTop()
    if (detail) await openUser(u.id)
  }

  return (
    <Layout me={me}>
      <h1 className="page-title">Admin</h1>
      {error && <p className="alert">{error}</p>}
      {summary ? (
        <section className="tiles wide">
          <div className="tile-m">
            <span className="tile-n">{summary.users}</span>
            <span className="tile-l">users</span>
          </div>
          <div className="tile-m">
            <span className="tile-n">{summary.active_users_period}</span>
            <span className="tile-l">active in 30 days</span>
          </div>
          <div className="tile-m">
            <span className="tile-n">{summary.calls_today}</span>
            <span className="tile-l">calls today</span>
          </div>
          <div className="tile-m">
            <span className="tile-n">{summary.calls_period}</span>
            <span className="tile-l">calls in 30 days</span>
          </div>
          <div className="tile-m">
            <span className="tile-n">{pct(summary.errors_period, summary.calls_period)}</span>
            <span className="tile-l">error rate</span>
          </div>
        </section>
      ) : (
        <SkeletonTiles count={5} />
      )}
      <div className="two-col">
        <section className="card">
          <h2>Calls per day</h2>
          {summary ? <Bars data={summary.by_day} /> : <SkeletonRows rows={3} />}
        </section>
        <section className="card">
          <h2>Top tools, 30 days</h2>
          {summary === null ? (
            <SkeletonRows rows={4} />
          ) : summary.by_tool.length ? (
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
                {summary.by_tool.slice(0, 12).map((t) => (
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
            <p className="muted">No calls yet.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Users</h2>
        {users === null ? (
          <SkeletonRows rows={4} />
        ) : (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th className="num">Tokens</th>
                <th className="num">Calls</th>
                <th className="num">Errors</th>
                <th>Last active</th>
                <th>Joined</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => void openUser(u.id)}>
                  <td>
                    <div className="usercell">
                      <strong>{u.name ?? u.email}</strong>
                      <span className="muted small">{u.email}</span>
                    </div>
                  </td>
                  <td className="num">
                    {u.active_token_count}/{u.token_count}
                  </td>
                  <td className="num">{u.call_count}</td>
                  <td className="num">{u.error_count}</td>
                  <td>{fmtAgo(u.last_active_at)}</td>
                  <td className="nowrap">{fmtDate(u.created_at)}</td>
                  <td>{u.is_admin ? <Tag tone="yellow">admin</Tag> : <Tag tone="neutral">member</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Event log</h2>
        <div className="row wrap">
          <select
            aria-label="Filter by user"
            value={filterUser}
            onChange={(e) => {
              setOffset(0)
              setFilterUser(e.target.value)
            }}
          >
            <option value="">All users</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
          <input
            aria-label="Filter by tool"
            value={filterTool}
            onChange={(e) => {
              setOffset(0)
              setFilterTool(e.target.value.trim())
            }}
            placeholder="Tool name, exact, e.g. get_pokemon"
          />
          <span className="muted small num">{events ? `${events.total} events` : ''}</span>
        </div>
        {events === null ? (
          <SkeletonRows rows={5} />
        ) : events.events.length ? (
          <>
            <table className="events">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
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
                    <td>{e.user_email ?? <span className="muted">legacy token</span>}</td>
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
            <div className="row">
              <button className="btn small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                Newer
              </button>
              <button className="btn small" disabled={offset + limit >= events.total} onClick={() => setOffset(offset + limit)}>
                Older
              </button>
            </div>
          </>
        ) : (
          <p className="muted">No events match these filters.</p>
        )}
      </section>

      {detail && (
        <Modal title={detail.user.name ?? detail.user.email} onClose={() => setDetail(null)}>
          <div className="muted small">
            <div>{detail.user.email}</div>
            <div>Joined {fmtDate(detail.user.created_at)}</div>
            <div>Last login {fmtAgo(detail.user.last_login_at)}</div>
          </div>
          <div className="row">
            {detail.user.is_admin ? (
              <button className="btn danger" disabled={detail.user.id === me.me.user.id} onClick={() => void toggleAdmin(detail.user, false)}>
                Remove admin
              </button>
            ) : (
              <button className="btn" onClick={() => void toggleAdmin(detail.user, true)}>
                Make admin
              </button>
            )}
          </div>
          <h3>Tokens</h3>
          {detail.tokens.length ? (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {detail.tokens.map((t) => (
                  <tr key={t.id} className={t.revoked_at ? 'dim' : ''}>
                    <td>{t.name}</td>
                    <td>
                      <code>{t.token_prefix}</code>
                    </td>
                    <td>{t.revoked_at ? `revoked ${fmtAgo(t.revoked_at)}` : `used ${fmtAgo(t.last_used_at)}, expires ${fmtExpiry(t.expires_at)}`}</td>
                    <td className="right">
                      {!t.revoked_at && (
                        <button className="btn small danger" onClick={() => void revokeToken(t.id)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No tokens.</p>
          )}
          <h3>Usage, 30 days</h3>
          <p>
            <span className="num">{detail.usage.total_calls}</span> calls, <span className="num">{detail.usage.error_calls}</span> errors
          </p>
          {detail.usage.by_tool.length > 0 && (
            <table>
              <tbody>
                {detail.usage.by_tool.map((t) => (
                  <tr key={t.tool}>
                    <td>
                      <code>{t.tool}</code>
                    </td>
                    <td className="num">{t.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </Layout>
  )
}
