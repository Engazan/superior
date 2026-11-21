import { useCallback, useEffect, useState } from 'react'
import type { DashboardError, DashboardResult } from '@shared/git-dashboard'

export const DASHBOARD_REFRESH_MS = 5 * 60_000

type Snapshot<T> = { scope: string; data?: T; error?: DashboardError }

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
        ? { scope, data: result.data }
        : { scope, data: prev?.scope === scope && result.error !== 'unlinked' ? prev.data : undefined, error: result.error })
      if (refreshMs) timer = window.setTimeout(() => void load(), Math.max(0, refreshMs - (Date.now() - startedAt)))
    }
    void load()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [scope, request, refreshMs, revision])

  const current = snapshot?.scope === scope ? snapshot : undefined
  return { data: current?.data, error: current?.error, loading: !!scope && !current, refresh }
}
