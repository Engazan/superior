import { useEffect, useState } from 'react'
import type { UpdateInfo } from '../types'

/** Re-check GitHub releases periodically while the app stays open. */
const RECHECK_MS = 6 * 60 * 60 * 1000

/**
 * Checks the project's GitHub releases for a newer version on mount and every
 * few hours after. Returns null until the first check resolves; failures resolve
 * to an "no update" UpdateInfo (handled in the main process), never throw.
 */
export function useUpdateCheck(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = (): void => {
      window.api
        .checkForUpdates()
        .then((next) => {
          if (!cancelled) setInfo(next)
        })
        .catch(() => {})
    }
    run()
    const id = window.setInterval(run, RECHECK_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return info
}
