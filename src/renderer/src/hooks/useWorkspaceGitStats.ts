import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../types'

/** Added/removed line totals for a workspace's working tree, when it's a repo. */
export interface WorkspaceGitStat {
  isRepository: boolean
  additions: number
  deletions: number
}

/** Effective git dir for a workspace: its isolated worktree, else the folder. */
function gitDirOf(ws: Workspace): string {
  return ws.worktreePath ?? ws.folderPath
}

/**
 * Poll per-workspace Git diff stats (added/removed lines) so the sidebar can
 * show a live +/- badge next to each workspace name. Directories are deduped —
 * several standard workspaces sharing a folder read git once — and the result
 * is fanned back out keyed by workspace id. Mirrors {@link useGitStatus}'s 3s
 * cadence so terminal-side checkouts/edits show up without a manual refresh.
 */
export function useWorkspaceGitStats(workspaces: Workspace[]): Record<string, WorkspaceGitStat> {
  const [stats, setStats] = useState<Record<string, WorkspaceGitStat>>({})

  // Latest workspaces for the fan-out, without re-subscribing on every render.
  const wsRef = useRef(workspaces)
  wsRef.current = workspaces

  // Re-subscribe only when the set of (id, dir) pairs changes — a rename alone
  // doesn't restart polling, but adding/removing a workspace does.
  const key = workspaces.map((ws) => `${ws.id}|${gitDirOf(ws)}`).join('\n')

  useEffect(() => {
    const dirs = Array.from(new Set(wsRef.current.map(gitDirOf)))
    if (dirs.length === 0) {
      setStats({})
      return
    }

    let active = true
    const refresh = async (): Promise<void> => {
      const entries = await Promise.all(
        dirs.map(async (dir) => [dir, await window.api.getGitStatus(dir).catch(() => null)] as const)
      )
      if (!active) return
      const byDir = new Map(entries)
      const next = Object.fromEntries(
        wsRef.current.map((ws) => {
          const status = byDir.get(gitDirOf(ws))
          return [
            ws.id,
            {
              isRepository: !!status?.isRepository,
              additions: status?.additions ?? 0,
              deletions: status?.deletions ?? 0
            }
          ]
        })
      )
      // Keep the previous object when nothing changed so App doesn't re-render
      // the whole tree every poll tick.
      setStats((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }

    void refresh()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return stats
}
