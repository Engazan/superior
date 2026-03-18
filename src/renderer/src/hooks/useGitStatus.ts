import { useCallback, useEffect, useState } from 'react'
import type { Folder, GitStatus } from '../types'

interface GitStatusApi {
  gitStatus: GitStatus | null
  gitLoading: boolean
  initializeGit: () => Promise<void>
}

/**
 * Track the active folder's Git status, polling so checkouts made inside a
 * terminal are reflected. `initializeGit` runs `git init` and reports failures
 * through `onError`.
 */
export function useGitStatus(
  activeFolder: Folder | null,
  onError: (message: string | null) => void
): GitStatusApi {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)

  useEffect(() => {
    if (!activeFolder) {
      setGitStatus(null)
      setGitLoading(false)
      return
    }

    let active = true
    const folderPath = activeFolder.path
    const refresh = async (showLoading = false): Promise<void> => {
      if (showLoading) setGitLoading(true)
      const status = await window.api.getGitStatus(folderPath)
      if (!active) return
      setGitStatus(status)
      setGitLoading(false)
    }

    setGitStatus(null)
    void refresh(true)
    const id = window.setInterval(() => void refresh(), 3000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [activeFolder])

  const initializeGit = useCallback(async () => {
    if (!activeFolder || gitLoading) return
    onError(null)
    setGitLoading(true)
    const status = await window.api.initGit(activeFolder.path)
    setGitStatus(status)
    setGitLoading(false)
    if (status.error) onError(status.error)
  }, [activeFolder, gitLoading, onError])

  return { gitStatus, gitLoading, initializeGit }
}
