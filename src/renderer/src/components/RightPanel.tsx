import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChangesView } from './ChangesView'
import { FilesView } from './FilesView'
import { HistoryView } from './HistoryView'
import { TasksView } from './TasksView'
import { useI18n } from '../i18n'
import type { TaskQueueApi } from '../hooks/useTaskQueue'
import type { AgentTask, FsEntry, GitDiff, TerminalPreset } from '../types'

type Tab = 'files' | 'changes' | 'history' | 'tasks'

interface Props {
  /** Whether the panel is open. Kept mounted while closed (for the slide
      animation), so polling is gated on this to stay idle when hidden. */
  active: boolean
  /** Folder backing the active workspace, or null when none is selected. */
  folderPath: string | null
  /** The active project folder (main repo path) the task queue is scoped to.
      Distinct from folderPath, which is the worktree dir for branch workspaces. */
  tasksFolder: string | null
  taskQueue: TaskQueueApi
  presets: TerminalPreset[]
  /** Jump to the workspace a task ran/runs in. */
  onJumpToTask: (task: AgentTask) => void
  /** Open a file's preview (handled at the app level so it spans the main area). */
  onOpenFile: (file: FsEntry) => void
  /** Path of the file currently previewed, for highlighting in the tree. */
  selectedPath: string | null
}

/**
 * Right-hand panel toggled from the title bar. Hosts the Files (project tree)
 * and Changes (working-tree diff) tabs. The diff is fetched here so the +/−
 * totals can show on the Changes tab even while the Files tab is open.
 */
export function RightPanel({
  active,
  folderPath,
  tasksFolder,
  taskQueue,
  presets,
  onJumpToTask,
  onOpenFile,
  selectedPath
}: Props): JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('changes')
  const [diff, setDiff] = useState<GitDiff | null>(null)
  const [loading, setLoading] = useState(false)
  // Monotonic token so a slow fetch can't overwrite a newer one (or a stale folder).
  const reqRef = useRef(0)

  const fetchDiff = useCallback(
    async (show: boolean): Promise<void> => {
      if (!folderPath) return
      const token = ++reqRef.current
      if (show) setLoading(true)
      const result = await window.api.getGitDiff(folderPath)
      if (token !== reqRef.current) return // superseded by a newer fetch
      setDiff(result)
      setLoading(false)
    },
    [folderPath]
  )

  // Refetch on folder change and poll so the view tracks working-tree edits.
  // Skipped while collapsed — the panel stays mounted only for its animation.
  useEffect(() => {
    setDiff(null)
    if (!folderPath || !active) return
    void fetchDiff(true)
    const id = window.setInterval(() => {
      if (!document.hidden) void fetchDiff(false)
    }, 3000)
    return () => window.clearInterval(id)
  }, [folderPath, fetchDiff, active])

  // Bumped on every explicit refresh (incl. after commit/pull) so the history
  // tab refetches its log without its own poller.
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback((): void => {
    setRefreshToken((n) => n + 1)
    void fetchDiff(true)
  }, [fetchDiff])

  const totals = diff?.isRepository && !diff.error ? diff.totals : null

  // Queued + running task count for this folder, badged on the Tasks tab.
  const pendingTasks = useMemo(
    () =>
      taskQueue.tasks.filter(
        (task) =>
          task.folderPath === tasksFolder &&
          (task.status === 'queued' || task.status === 'running')
      ).length,
    [taskQueue.tasks, tasksFolder]
  )

  const tabClass = (active: boolean): string =>
    `flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition border-b-2 ${
      active ? 'border-accent text-fg' : 'border-transparent text-fgmuted hover:text-fg'
    }`

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-edge bg-bar">
      <div className="flex shrink-0 border-b border-edge">
        <button className={tabClass(tab === 'files')} onClick={() => setTab('files')}>
          {t('rightPanel.files')}
        </button>
        <button className={tabClass(tab === 'changes')} onClick={() => setTab('changes')}>
          {t('rightPanel.changes')}
          {totals && (totals.additions > 0 || totals.deletions > 0) && (
            <span className="font-mono text-[10px] tabular-nums">
              {totals.additions > 0 && <span className="text-status">+{totals.additions}</span>}
              {totals.additions > 0 && totals.deletions > 0 && ' '}
              {totals.deletions > 0 && <span className="text-danger">−{totals.deletions}</span>}
            </span>
          )}
        </button>
        <button className={tabClass(tab === 'history')} onClick={() => setTab('history')}>
          {t('rightPanel.history')}
        </button>
        <button className={tabClass(tab === 'tasks')} onClick={() => setTab('tasks')}>
          {t('rightPanel.tasks')}
          {pendingTasks > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-accent">{pendingTasks}</span>
          )}
        </button>
      </div>

      {tab === 'changes' ? (
        <ChangesView folderPath={folderPath} diff={diff} loading={loading} onRefresh={refresh} />
      ) : tab === 'history' ? (
        <HistoryView folderPath={folderPath} refreshToken={refreshToken} />
      ) : tab === 'tasks' ? (
        <TasksView
          folderPath={tasksFolder}
          queue={taskQueue}
          presets={presets}
          onJumpTo={onJumpToTask}
        />
      ) : (
        <FilesView folderPath={folderPath} onOpenFile={onOpenFile} selectedPath={selectedPath} />
      )}
    </aside>
  )
}
