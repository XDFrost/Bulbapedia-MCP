export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** JSON fetch against the Worker on the same origin. Sends the CSRF header on mutations. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'fetch', ...(init.headers as Record<string, string>) }
  let body = init.body
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.json)
  }
  const res = await fetch(path, { ...init, headers, body, credentials: 'same-origin' })
  if (res.status === 204) return undefined as T
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & T
  if (!res.ok) throw new ApiError(res.status, data.message ?? data.error ?? `HTTP ${res.status}`)
  return data
}

export interface Me {
  user: { id: string; email: string; name: string | null; avatar_url: string | null; is_admin: boolean; created_at: string; last_login_at: string | null }
  is_admin: boolean
}
export interface MeResponse {
  user: Me['user'] | null
  is_admin: boolean
}

export interface TokenRecord {
  id: string
  user_id: string
  name: string
  token_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  expires_at: string | null
}

export const TTL_OPTIONS: { label: string; value: string }[] = [
  { label: '1 hour', value: '1h' },
  { label: '1 day', value: '1d' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: '1 year', value: '365d' },
  { label: 'Never expires', value: 'never' },
]

export interface UsageSummary {
  days: number
  total_calls: number
  error_calls: number
  by_tool: { tool: string; calls: number; errors: number; avg_ms: number | null }[]
  by_day: { day: string; calls: number; errors: number }[]
}

export interface UsageEvent {
  id: number
  user_id: string | null
  token_id: string | null
  tool: string
  args: Record<string, unknown> | null
  ok: boolean
  error: string | null
  duration_ms: number | null
  created_at: string
  user_email: string | null
  token_name: string | null
}

export interface EventPage {
  total: number
  events: UsageEvent[]
  limit: number
  offset: number
}

export interface AdminSummary extends UsageSummary {
  users: number
  calls_today: number
  calls_period: number
  errors_period: number
  active_users_period: number
}

export interface AdminUser {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  is_admin: boolean
  created_at: string
  last_login_at: string | null
  token_count: number
  active_token_count: number
  call_count: number
  error_count: number
  last_active_at: string | null
}
