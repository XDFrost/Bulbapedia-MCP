import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Me, type MeResponse } from './api.ts'

export interface MeState {
  loading: boolean
  me: Me | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

export function useMe(): MeState {
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<Me | null>(null)
  const refresh = useCallback(async () => {
    try {
      const r = await api<MeResponse>('/api/me')
      setMe(r.user ? { user: r.user, is_admin: r.is_admin } : null)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 503)) setMe(null)
      else throw e
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    setMe(null)
  }, [])
  return { loading, me, refresh, logout }
}
