import { useCallback, useEffect, useState } from 'react'
import type { DashboardError, DashboardResult } from '@shared/git-dashboard'

export const DASHBOARD_REFRESH_MS = 5 * 60_000

type Snapshot<T> = { scope: string; revision: number; data?: T; error?: DashboardError; updatedAt?: number }

export function useDashboardData<T>(
  scope: string | null,
  request: () => Promise<DashboardResult<T>>,
  refreshMs?: number
) {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>()
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!scope) return
    let active = true
    let timer: number | undefined
    async function load(): Promise<void> {
      const startedAt = Date.now()
      const result = await request().catch((): DashboardResult<T> => ({ error: 'unavailable' }))
      if (!active || !scope) return
      setSnapshot((prev) => 'data' in result
        ? { scope, revision, data: result.data, updatedAt: startedAt }
        : {
          scope, revision, error: result.error,
          data: prev?.scope === scope && result.error !== 'unlinked' ? prev.data : undefined,
          updatedAt: prev?.scope === scope && result.error !== 'unlinked' ? prev.updatedAt : undefined
        })
      if (refreshMs) timer = window.setTimeout(() => void load(), Math.max(0, refreshMs - (Date.now() - startedAt)))
    }
    void load()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [scope, request, refreshMs, revision])

  const current = snapshot?.scope === scope ? snapshot : undefined
  return {
    data: current?.data, error: current?.error, updatedAt: current?.updatedAt,
    loading: !!scope && !current, refreshing: !!scope && current?.revision !== revision, refresh
  }
}
