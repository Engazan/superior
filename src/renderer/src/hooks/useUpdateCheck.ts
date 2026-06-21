import { useCallback, useEffect, useState } from 'react'
import type { UpdateInfo, UpdateProgress } from '../types'

/** Re-check GitHub releases periodically while the app stays open. */
const RECHECK_MS = 6 * 60 * 60 * 1000

export interface UpdateController {
  /** Latest GitHub-release check, or null until the first one resolves. */
  info: UpdateInfo | null
  /** Live download/install phase for the in-app updater. */
  progress: UpdateProgress
  /** Start downloading the available update. */
  startDownload: () => void
  /** Quit and install a finished download, relaunching the app. */
  installAndRestart: () => void
}

/**
 * Checks the project's GitHub releases for a newer version on mount and every
 * few hours after, and exposes the in-app download/install flow. The version
 * check never throws (failures resolve to "no update" in the main process); the
 * download is driven by push events from electron-updater.
 */
export function useUpdateCheck(): UpdateController {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgress>({ phase: 'idle' })

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

  // Live progress pushed from the main process during download/install.
  useEffect(() => window.api.onUpdateStatus(setProgress), [])

  const startDownload = useCallback(() => {
    setProgress({ phase: 'downloading', percent: 0 })
    window.api.downloadUpdate().catch(() => setProgress({ phase: 'error' }))
  }, [])

  const installAndRestart = useCallback(() => {
    window.api.installUpdate()
  }, [])

  return { info, progress, startDownload, installAndRestart }
}
