import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DiffReview, ReviewCommentEditor } from './DiffReview'
import { useDiffReview } from '../hooks/useDiffReview'
import { reviewScope, reviewTargets, sameReviewAnchor, type ReviewAnchor, type ReviewNote } from '../diffReview'
import { ChangesView } from './ChangesView'
import { FilesView } from './FilesView'
import { HistoryView } from './HistoryView'
import { TasksView } from './TasksView'
import { Button, FolderIcon, Notice } from './ui'
import { useI18n } from '../i18n'
import type { TaskQueueApi } from '../hooks/useTaskQueue'
import type { AgentSession, AgentTask, FsEntry, GitDiff, TerminalPreset } from '../types'

const TABS = ['files', 'changes', 'history', 'tasks'] as const
type Tab = (typeof TABS)[number]

interface Props {
  /** Increment to reveal the file tree without locking the selected tab. */
  filesRevealRequest: number
  /** Whether the panel is open. Kept mounted while closed (for the slide
      animation), so polling is gated on this to stay idle when hidden. */
  active: boolean
  codeEnabled: boolean
  onOpenSettings: () => void
  workspaceId: string | null
  sessions: AgentSession[]
  onReviewSent: (session: AgentSession) => void
  /** Folder backing the active workspace, or null when none is selected. */
  folderPath: string | null
  /** True for SSH-backed workspaces; their filesystem/git/task panels are local-only in v1. */
  isRemoteWorkspace: boolean
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
  /** Panel width in px — owned by App (drag-resizable, persisted). */
  width: number
}

/**
 * Right-hand panel toggled from the title bar. Hosts the Files (project tree)
 * and Changes (working-tree diff) tabs.
 */
export function RightPanel({
  filesRevealRequest,
  active,
  codeEnabled,
  onOpenSettings,
  workspaceId,
  sessions,
  onReviewSent,
  folderPath,
  isRemoteWorkspace,
  tasksFolder,
  taskQueue,
  presets,
  onJumpToTask,
  onOpenFile,
  selectedPath,
  width
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const scope = reviewScope(workspaceId, folderPath)
  const review = useDiffReview(scope)
  const [editor, setEditor] = useState<{ scope: string; anchor: ReviewAnchor; note?: ReviewNote } | null>(null)
  const openComment = (anchor: ReviewAnchor): void => setEditor({ scope, anchor, note: review.notes.find((note) => sameReviewAnchor(note, anchor)) })
  const [tab, setTab] = useState<Tab>('changes')
  // Keep only expansion paths while the heavy file tree is unmounted.
  const [treeState, setTreeState] = useState<{ folder: string | null; paths: ReadonlySet<string> }>({ folder: folderPath, paths: new Set() })
  const expandedPaths = treeState.folder === folderPath ? treeState.paths : new Set<string>()
  const onToggleDirectory = (path: string): void => {
    setTreeState((previous) => {
      const paths = new Set(previous.folder === folderPath ? previous.paths : [])
      if (paths.has(path)) paths.delete(path)
      else paths.add(path)
      return { folder: folderPath, paths }
    })
  }
  const diffActive = active && !isRemoteWorkspace && tab === 'changes'

  // Restore the last-open tab once; after that every switch persists, so users
  // who live in Tasks aren't dropped back on Changes each app run.
  const tabRestored = useRef(false)
  useEffect(() => {
    void window.api.getSettings().then((s) => {
      if (tabRestored.current) return
      tabRestored.current = true
      if (s.ui.rightPanelTab) setTab(s.ui.rightPanelTab)
    })
  }, [])
  const selectTab = useCallback((next: Tab): void => {
    tabRestored.current = true
    setTab(next)
    void window.api.setUiState({ rightPanelTab: next })
  }, [])
  useEffect(() => {
    if (filesRevealRequest > 0) selectTab('files')
  }, [filesRevealRequest, selectTab])
  const [diff, setDiff] = useState<GitDiff | null>(null)
  const [diffFolder, setDiffFolder] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Monotonic token so a slow fetch can't overwrite a newer one (or a stale folder).
  const reqRef = useRef(0)

  const fetchDiff = useCallback(
    async (show: boolean): Promise<void> => {
      if (!folderPath || !diffActive) return
      const token = ++reqRef.current
      if (show) setLoading(true)
      // A rejected IPC must clear the spinner instead of sticking on "Loading…".
      const result = await window.api.getGitDiff(folderPath).catch(() => null)
      if (token !== reqRef.current) return // superseded by a newer fetch
      if (!result) {
        setLoading(false)
        return
      }
      // Keep the previous object when nothing changed: React then bails out of
      // the update entirely, so an idle 3s poll stops re-rendering every hunk
      // row of a large diff (thousands of elements) for no visual change.
      setDiffFolder(folderPath)
      setDiff((prev) => (prev && JSON.stringify(prev) === JSON.stringify(result) ? prev : result))
      setLoading(false)
    },
    [folderPath, diffActive]
  )

  // Full hunks exist only while Changes is visible. Other tabs reuse the title-bar summary.
  useEffect(() => {
    setDiff(null)
    setLoading(false)
    if (!folderPath || !diffActive) return
    void fetchDiff(true)
    const id = window.setInterval(() => {
      if (!document.hidden) void fetchDiff(false)
    }, 3000)
    return () => {
      window.clearInterval(id)
      // Invalidate asynchronous responses; this ref is a counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++reqRef.current
    }
  }, [folderPath, fetchDiff, diffActive])

  // Bumped on every explicit refresh (incl. after commit/pull) so the history
  // tab refetches its log without its own poller.
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback((): void => {
    setRefreshToken((n) => n + 1)
    void fetchDiff(true)
  }, [fetchDiff])

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

  const onTabKeyDown = (e: React.KeyboardEvent): void => {
    const idx = TABS.indexOf(tab)
    const next =
      e.key === 'ArrowLeft' ? TABS[(idx - 1 + TABS.length) % TABS.length]
        : e.key === 'ArrowRight' ? TABS[(idx + 1) % TABS.length]
          : e.key === 'Home' ? TABS[0]
            : e.key === 'End' ? TABS[TABS.length - 1]
              : null
    if (!next) return
    e.preventDefault()
    selectTab(next)
    ;(e.currentTarget.parentElement?.querySelector(`[data-tab="${next}"]`) as HTMLElement)?.focus()
  }
  const tabA11y = (id: Tab): Record<string, unknown> => ({
    type: 'button',
    role: 'tab',
    id: `right-panel-tab-${id}`,
    'data-tab': id,
    'aria-selected': tab === id,
    'aria-controls': 'right-panel-tabpanel',
    'aria-label': t(`rightPanel.${id}` as Parameters<typeof t>[0]),
    tabIndex: tab === id ? 0 : -1,
    title: t(`rightPanel.${id}` as Parameters<typeof t>[0]),
    onKeyDown: onTabKeyDown,
    onClick: () => selectTab(id)
  })

  return (
    <aside
      style={{ width }}
      className="superior-right-panel flex shrink-0 flex-col overflow-hidden bg-panel px-4 pb-4 pt-4"
      aria-label={t('rightPanel.tabListLabel')}
    >
      <div role="tablist" aria-label={t('rightPanel.tabListLabel')}
        className="superior-inspector-tabs grid shrink-0 grid-cols-4 gap-0.5 rounded-[10px] border border-edge bg-bar p-[3px]">
        {TABS.map((id) => (
          <button key={id} {...tabA11y(id)}
            className="flex h-7 min-w-0 items-center justify-center gap-1 rounded-[7px] px-1 text-xs text-fgmuted transition hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
            <span className="truncate">{t(`rightPanel.${id}`)}</span>
            {id === 'tasks' && pendingTasks > 0 && <span className="shrink-0 font-mono text-[10px] text-accent">{pendingTasks}</span>}
          </button>
        ))}
      </div>

      {/* One panel region for every tab; each view supplies the same
          anatomy: h-10 toolbar, scrolling list, optional composer footer. */}
      <div
        role="tabpanel"
        id="right-panel-tabpanel"
        aria-labelledby={`right-panel-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
      {tab === 'files' && !codeEnabled ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-fgmuted">
          <FolderIcon size={24} />
          <p>{t('files.codeDisabled')}</p>
          <Button variant="secondary" size="sm" onClick={onOpenSettings}>{t('files.enableInSettings')}</Button>
        </div>
      ) : isRemoteWorkspace ? (
        <div className="p-3">
          <Notice tone="info">{t('remote.localOnlyPanel')}</Notice>
        </div>
      ) : tab === 'changes' ? (
        <>
          <ChangesView key={`changes:${scope}`} folderPath={folderPath} diff={diffFolder === folderPath ? diff : null}
            loading={loading} onRefresh={refresh} reviewNotes={review.notes} onComment={openComment}
            reviewPanel={workspaceId && folderPath ? (
              <DiffReview key={`review:${scope}`} notes={review.notes}
                onEdit={(note) => setEditor({ scope, anchor: note, note })}
                onRemove={(id) => review.update(review.notes.filter((note) => note.id !== id))}
                targets={reviewTargets(sessions, workspaceId)} workspaceId={workspaceId} folderPath={folderPath}
                onSent={onReviewSent} storageFailed={review.storageFailed} />
            ) : undefined} />
          {active && editor?.scope === scope && <ReviewCommentEditor key={JSON.stringify(editor.anchor)}
            anchor={editor.anchor} note={editor.note} onClose={() => setEditor(null)}
            onSave={(note) => review.update([...review.notes.filter((item) => item.id !== note.id), note])} />}
        </>
      ) : tab === 'history' ? (
        active && <HistoryView folderPath={folderPath} refreshToken={refreshToken} />
      ) : tab === 'tasks' ? (
        <TasksView
          folderPath={tasksFolder}
          queue={taskQueue}
          presets={presets}
          onJumpTo={onJumpToTask}
        />
      ) : (
        active && <FilesView key={folderPath} expandedPaths={expandedPaths} onToggleDirectory={onToggleDirectory} folderPath={folderPath} onOpenFile={onOpenFile} selectedPath={selectedPath} />
      )}
      </div>
    </aside>
  )
}
