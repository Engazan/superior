import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitStatus } from '../types'

interface GitStatusApi {
  gitStatus: GitStatus | null
  gitLoading: boolean
  initializeGit: () => Promise<void>
  /** Re-read status now (e.g. right after switching branch), without waiting for the poll. */
  refresh: () => Promise<void>
}

/**
 * Track the active workspace's Git status, polling so checkouts made inside a
 * terminal are reflected. `gitDir` is the workspace's effective directory (its
 * worktree when worktree-backed, else the repo root) so the branch/diff reflect
 * the isolated tree. `initDir` is the repo root — `git init` can't run inside a
 * worktree, and a worktree-backed workspace is already a repo, so Init only ever
 * targets a plain folder.
 */
export function useGitStatus(
  gitDir: string | null,
  initDir: string | null,
  onError: (message: string | null) => void
): GitStatusApi {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)
  // Monotonic sequence so a slow poll response resolving late can't clobber a
  // newer manual refresh (e.g. right after a branch switch).
  const seqRef = useRef(0)

  useEffect(() => {
    if (!gitDir) {
      setGitStatus(null)
      setGitLoading(false)
      return
    }

    let active = true
    const refresh = async (showLoading = false): Promise<void> => {
      if (showLoading) setGitLoading(true)
      const seq = ++seqRef.current
      const status = await window.api.getGitStatus(gitDir)
      if (!active || seq !== seqRef.current) return
      // Keep the previous object when nothing changed so App doesn't re-render
      // the whole tree every poll tick.
      setGitStatus((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(status) ? prev : status
      )
      setGitLoading(false)
    }

    setGitStatus(null)
    void refresh(true)
    const id = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, 3000)
    const onVisible = (): void => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [gitDir])

  const refresh = useCallback(async () => {
    if (!gitDir) return
    const seq = ++seqRef.current
    const status = await window.api.getGitStatus(gitDir)
    if (seq !== seqRef.current) return
    // Same reference-preserving compare as the poller, so a no-op manual
    // refresh doesn't force an App re-render.
    setGitStatus((prev) => (prev && JSON.stringify(prev) === JSON.stringify(status) ? prev : status))
  }, [gitDir])

  const initializeGit = useCallback(async () => {
    if (!initDir || gitLoading) return
    onError(null)
    setGitLoading(true)
    const status = await window.api.initGit(initDir)
    setGitStatus(status)
    setGitLoading(false)
    if (status.error) onError(status.error)
  }, [initDir, gitLoading, onError])

  return { gitStatus, gitLoading, initializeGit, refresh }
}
