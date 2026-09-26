export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'none'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export function fmtArgs(args: Record<string, unknown> | null): string {
  if (!args) return ''
  return Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
}

export function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : '0%'
}

/** "in 3 d", "in 2 h", "expired" or "never". */
export function fmtExpiry(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const m = Math.round(diff / 60000)
  if (m < 60) return `in ${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `in ${h} h`
  return `in ${Math.round(h / 24)} d`
}
