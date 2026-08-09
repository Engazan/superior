import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { useAttentionColor } from '../attentionColor'
import { useBusyWorkspaces, useAttentionWorkspaces } from '../activityStore'
import {
  ChevronIcon,
  ExternalLinkIcon,
  GearIcon,
  GripIcon,
  KebabIcon,
  Menu,
  PencilIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
  type MenuItem
} from './ui'
import { useShortcutTitle } from '../shortcuts'
import {
  BranchBadge,
  DiffStat,
  FolderGlyph,
  RemoteBadge,
  RunningBadge,
  UpdateGlyph,
  WorkingSpinner,
  folderLabel,
  folderTitle,
  folderTint,
  initial,
  updateTitle
} from './sidebar/parts'
import { WorkspaceCreateModal } from './sidebar/WorkspaceCreateModal'
import { FolderEditModal } from './sidebar/FolderEditModal'
import type { UpdateController } from '../hooks/useUpdateCheck'
import type { WorkspaceGitStat } from '../hooks/useWorkspaceGitStats'
import type { Folder, FolderUpdate, Workspace, WorktreeAddArgs } from '../types'

interface Props {
  folders: Folder[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  /** running-terminal count per workspace id */
  counts: Record<string, number>
  /** git +/- line totals per workspace id, for the diff badge next to each name */
  gitStats: Record<string, WorkspaceGitStat>
  /** update notification + in-app download/install controller */
  update: UpdateController
  collapsed: boolean
  /** Expand the rail (used when a collapsed-rail action needs the full sidebar). */
  onExpand: () => void
  /** Open the "open or clone a project" modal (local folder or git forge). */
  onOpenProject: () => void
  /** Open the settings view. Its button is pinned to the bottom of the rail. */
  onOpenSettings: () => void
  onRemoveFolder: (path: string) => void
  /** Persist a new folder order after a drag-to-reorder in the sidebar. */
  onReorderFolders: (orderedPaths: string[]) => void
  /** Update a folder's display name / custom icon (its path is immutable). */
  onUpdateFolder: (folderPath: string, patch: FolderUpdate) => void
  onAddWorkspace: (folderPath: string, name: string) => Promise<string | null>
  /** Create a worktree-backed workspace; resolves with a localized error or null. */
  onAddWorktreeWorkspace: (args: WorktreeAddArgs) => Promise<string | null>
  onRenameWorkspace: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => void
  onSelectWorkspace: (id: string) => void
}

/** Anchor for a shared kebab/context menu: an element (kebab) or a point (right-click). */
type MenuAnchor = HTMLElement | { x: number; y: number }

export const Sidebar = memo(function Sidebar({
  folders,
  workspaces,
  activeWorkspaceId,
  counts,
  gitStats,
  update,
  collapsed,
  onExpand,
  onOpenProject,
  onOpenSettings,
  onRemoveFolder,
  onReorderFolders,
  onUpdateFolder,
  onAddWorkspace,
  onAddWorktreeWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onSelectWorkspace
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const shortcutTitle = useShortcutTitle()
  // Live activity signals, subscribed here (not in App) so per-chunk terminal
  // output only ever re-renders the sidebar — and only on real transitions.
  const busyWorkspaceIds = useBusyWorkspaces()
  const attentionWorkspaceIds = useAttentionWorkspaces()
  const { attentionColor } = useAttentionColor()
  // Editors: which workspace is being renamed and which folder is creating a workspace.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // The one open folder menu (kebab or right-click — same items either way).
  const [folderMenu, setFolderMenu] = useState<{ path: string; anchor: MenuAnchor } | null>(null)
  // The one open workspace menu.
  const [wsMenu, setWsMenu] = useState<{ id: string; anchor: MenuAnchor } | null>(null)
  // The folder currently open in the edit dialog.
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  const [workspaceQuery, setWorkspaceQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteWorkspaceIds, setFavoriteWorkspaceIds] = useState<Set<string>>(new Set())
  const [recentWorkspaceIds, setRecentWorkspaceIds] = useState<string[]>([])
  const [workspaceToolsVisible, setWorkspaceToolsVisible] = useState(false)

  useEffect(() => {
    void window.api.getSettings().then((settings) => {
      setFavoriteWorkspaceIds(new Set(settings.ui.favoriteWorkspaceIds ?? []))
      setRecentWorkspaceIds(settings.ui.recentWorkspaceIds ?? [])
      setWorkspaceToolsVisible(settings.ui.sidebarWorkspaceTools)
    })
  }, [])

  const persistWorkspaceUi = (favorites: Set<string>, recent: string[]): void => {
    void window.api.setUiState({
      favoriteWorkspaceIds: [...favorites],
      recentWorkspaceIds: recent.slice(0, 12)
    })
  }

  const selectWorkspace = (id: string): void => {
    onSelectWorkspace(id)
    setRecentWorkspaceIds((previous) => {
      const next = [id, ...previous.filter((item) => item !== id)].slice(0, 12)
      persistWorkspaceUi(favoriteWorkspaceIds, next)
      return next
    })
  }

  const toggleFavorite = (id: string): void => {
    setFavoriteWorkspaceIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistWorkspaceUi(next, recentWorkspaceIds)
      return next
    })
  }

  const normalizedQuery = workspaceQuery.trim().toLowerCase()
  const filteredWorkspaceIds = useMemo(() => {
    const result = new Set<string>()
    for (const workspace of workspaces) {
      const folder = folders.find((item) => item.path === workspace.folderPath)
      const haystack = `${workspace.name} ${workspace.branch ?? ''} ${folder?.name ?? ''} ${folder?.displayName ?? ''}`.toLowerCase()
      if ((!normalizedQuery || haystack.includes(normalizedQuery)) && (!favoritesOnly || favoriteWorkspaceIds.has(workspace.id))) {
        result.add(workspace.id)
      }
    }
    return result
  }, [workspaces, folders, normalizedQuery, favoritesOnly, favoriteWorkspaceIds])
  const recentWorkspaces = useMemo(
    () =>
      recentWorkspaceIds
        .map((id) => workspaces.find((workspace) => workspace.id === id))
        .filter((workspace): workspace is Workspace => !!workspace && filteredWorkspaceIds.has(workspace.id))
        .slice(0, 3),
    [recentWorkspaceIds, workspaces, filteredWorkspaceIds]
  )
  // Drag-to-reorder for folders, pointer-based (not HTML5 DnD): the list
  // reorders live while dragging so the drop position is always visible, and
  // Escape cancels. All tracking runs on window listeners registered at drag
  // start — never on the grip element itself, whose DOM node React MOVES on
  // every live reorder, which would silently kill its pointer capture (and
  // with it the whole drag). The pointer is captured by the <nav> (a node
  // that never moves) so events keep flowing even outside the sidebar.
  const navRef = useRef<HTMLElement | null>(null)
  const [folderDrag, setFolderDrag] = useState<{
    path: string
    /** live working order of folder paths, applied to rendering while dragging */
    order: string[]
  } | null>(null)

  const beginFolderDrag =
    (path: string) =>
    (e: React.PointerEvent<HTMLElement>): void => {
      // Left button / primary touch only; keep the click from toggling collapse.
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const nav = navRef.current
      const pointerId = e.pointerId
      const startY = e.clientY
      // Capture on the nav (it never remounts/moves), so moves outside the
      // window still arrive and the drag can't be silently dropped.
      try {
        nav?.setPointerCapture(pointerId)
      } catch {
        /* capture is an enhancement — the window listeners work without it */
      }

      // Mutable drag bookkeeping lives in this closure; state only drives paint.
      let order = folders.map((f) => f.path)
      let active = false

      const move = (ev: PointerEvent): void => {
        if (ev.pointerId !== pointerId) return
        // A few px of slack so a plain click on the grip never counts as a drag.
        if (!active && Math.abs(ev.clientY - startY) < 4) return
        if (!nav) return
        // Keep long lists reachable: nudge the scroll when hugging an edge.
        const box = nav.getBoundingClientRect()
        if (ev.clientY < box.top + 24) nav.scrollTop -= 8
        else if (ev.clientY > box.bottom - 24) nav.scrollTop += 8
        // Insertion index = how many other folder blocks sit above the pointer
        // (by their vertical midpoint), clamped to the list by construction.
        const others = Array.from(nav.querySelectorAll<HTMLElement>('[data-folder-path]')).filter(
          (el) => el.dataset.folderPath !== path
        )
        let index = 0
        for (const el of others) {
          const r = el.getBoundingClientRect()
          if (ev.clientY > r.top + r.height / 2) index++
        }
        const next = order.filter((p) => p !== path)
        next.splice(index, 0, path)
        const changed = next.join('\n') !== order.join('\n')
        if (active && !changed) return
        active = true
        order = next
        setFolderDrag({ path, order: next })
      }

      const teardown = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        window.removeEventListener('keydown', key, true)
        try {
          nav?.releasePointerCapture(pointerId)
        } catch {
          /* already released */
        }
        setFolderDrag(null)
      }

      const up = (ev: PointerEvent): void => {
        if (ev.pointerId !== pointerId) return
        const changed = active && order.join('\n') !== folders.map((f) => f.path).join('\n')
        teardown()
        if (changed) onReorderFolders(order)
      }

      // Cancelled gesture / Escape: restore the original order.
      const cancel = (ev: PointerEvent): void => {
        if (ev.pointerId === pointerId) teardown()
      }
      const key = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape') {
          ev.stopPropagation()
          teardown()
        }
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
      window.addEventListener('keydown', key, true)
    }

  // While a drag is live, force the grabbing cursor and disable text selection
  // everywhere (the pointer is captured, so the cursor must be set globally).
  const isDraggingFolder = folderDrag !== null
  useEffect(() => {
    if (!isDraggingFolder) return
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [isDraggingFolder])

  // Folders in their live drag order while dragging, persisted order otherwise.
  const displayFolders = folderDrag
    ? (folderDrag.order
        .map((p) => folders.find((f) => f.path === p))
        .filter(Boolean) as Folder[])
    : folders

  // Persist the expand/collapse state on the folder so it survives a restart.
  const toggleFolder = (folder: Folder): void =>
    onUpdateFolder(folder.path, { collapsed: !folder.collapsed })

  const startRename = (ws: Workspace): void => {
    setAddingFor(null)
    setEditingId(ws.id)
    setDraft(ws.name)
  }
  const commitRename = (): void => {
    if (editingId) onRenameWorkspace(editingId, draft)
    setEditingId(null)
  }
  const startAdd = (folderPath: string): void => {
    setEditingId(null)
    setAddingFor(folderPath)
  }

  /** The folder actions offered by both the kebab and the right-click menu. */
  const folderMenuItems = (folder: Folder): MenuItem[] => [
    {
      id: 'edit',
      label: t('folder.edit'),
      icon: <PencilIcon size={13} />,
      onSelect: () => setEditingFolder(folder)
    },
    {
      id: 'add-workspace',
      label: t('sidebar.addWorkspace'),
      icon: <span className="text-sm leading-none">+</span>,
      onSelect: () => startAdd(folder.path)
    },
    'separator',
    {
      id: 'remove',
      label: t('sidebar.removeFolder'),
      icon: <TrashIcon size={13} />,
      tone: 'danger',
      onSelect: () => onRemoveFolder(folder.path)
    }
  ]

  /** The workspace actions offered by both the kebab and the right-click menu. */
  const wsMenuItems = (ws: Workspace): MenuItem[] => [
    {
      id: 'rename',
      label: t('sidebar.renameWorkspaceAction'),
      icon: <PencilIcon size={13} />,
      onSelect: () => startRename(ws)
    },
    ...(ws.worktreePath
      ? [
          {
            id: 'reveal',
            label: t('worktree.revealInFinder'),
            icon: <ExternalLinkIcon size={13} />,
            onSelect: () => void window.api.openPath(ws.worktreePath as string)
          } as const
        ]
      : []),
    'separator',
    {
      id: 'remove',
      label: t('sidebar.removeWorkspace'),
      icon: <TrashIcon size={13} />,
      tone: 'danger',
      onSelect: () => onRemoveWorkspace(ws.id)
    }
  ]

  // Menus + dialogs shared between the collapsed rail and the expanded sidebar.
  const menuFolder = folderMenu ? folders.find((f) => f.path === folderMenu.path) ?? null : null
  const menuWs = wsMenu ? workspaces.find((w) => w.id === wsMenu.id) ?? null : null
  const addingFolder = addingFor ? folders.find((f) => f.path === addingFor) ?? null : null
  const overlays = (
    <>
      {folderMenu && menuFolder && (
        <Menu
          items={folderMenuItems(menuFolder)}
          anchor={folderMenu.anchor}
          onClose={() => setFolderMenu(null)}
        />
      )}
      {wsMenu && menuWs && (
        <Menu items={wsMenuItems(menuWs)} anchor={wsMenu.anchor} onClose={() => setWsMenu(null)} />
      )}
      {editingFolder && (
        <FolderEditModal
          folder={editingFolder}
          onCancel={() => setEditingFolder(null)}
          onSave={(patch) => onUpdateFolder(editingFolder.path, patch)}
        />
      )}
      {addingFolder && (
        <WorkspaceCreateModal
          folder={addingFolder}
          existingNames={workspaces
            .filter((w) => w.folderPath === addingFolder.path)
            .map((w) => w.name)}
          onCancel={() => setAddingFor(null)}
          onCreateStandard={onAddWorkspace}
          onCreateWorktree={onAddWorktreeWorkspace}
        />
      )}
    </>
  )

  // Collapsed: a narrow rail with workspace initials + a running-count dot.
  if (collapsed) {
    return (
      <aside
        className="superior-sidebar flex w-14 shrink-0 select-none flex-col items-stretch overflow-hidden bg-bar transition-[width] duration-200 ease-out"
      >
        {overlays}
        <div className="flex flex-col items-center gap-1 border-b border-edge p-2">
          <button
            onClick={onOpenProject}
            title={t('sidebar.openProject')}
            aria-label={t('sidebar.openProject')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            +
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          <div className="flex flex-col items-center gap-2">
            {folders.map((folder, i) => {
              const folderWorkspaces = workspaces.filter((w) => w.folderPath === folder.path)
              const folderRunning = folderWorkspaces.reduce((a, w) => a + (counts[w.id] ?? 0), 0)
              const folderBusy = folderWorkspaces.some((w) => busyWorkspaceIds.has(w.id))
              const folderAttn = folderWorkspaces.some((w) => attentionWorkspaceIds.has(w.id))
              return (
                <div key={folder.path} className="flex w-full flex-col items-center gap-1.5">
                  {i > 0 && <div className="my-1 h-px w-6 bg-edge" />}

                  {/* Project marker — folder glyph; jumps to its first workspace.
                      With no workspaces it expands the sidebar instead of no-oping. */}
                  <button
                    onClick={() => {
                      if (folderWorkspaces[0]) selectWorkspace(folderWorkspaces[0].id)
                      else onExpand()
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setFolderMenu({ path: folder.path, anchor: { x: e.clientX, y: e.clientY } })
                    }}
                    title={folderTitle(folder)}
                    aria-label={folderLabel(folder)}
                    style={folderTint(folder.color)}
                    className="relative flex h-7 w-8 items-center justify-center rounded-md text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <FolderGlyph folder={folder} />
                    {folderBusy ? (
                      <WorkingSpinner className="absolute -right-0.5 -top-0.5 h-3 w-3" />
                    ) : folderAttn ? (
                      <span
                        style={{ '--attn': attentionColor } as CSSProperties}
                        className="attention-pulse-dot absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bar"
                      />
                    ) : (
                      folderRunning > 0 && (
                        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bar bg-status" />
                      )
                    )}
                  </button>

                  {/* Workspaces — square initial badges */}
                  {folderWorkspaces.map((ws) => {
                    const active = ws.id === activeWorkspaceId
                    const n = counts[ws.id] ?? 0
                    const busy = busyWorkspaceIds.has(ws.id)
                    const attn = attentionWorkspaceIds.has(ws.id)
                    return (
                      <button
                        key={ws.id}
                        onClick={() => selectWorkspace(ws.id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setWsMenu({ id: ws.id, anchor: { x: e.clientX, y: e.clientY } })
                        }}
                        title={`${folderLabel(folder)} / ${ws.name}${ws.branch ? ` · ${ws.branch}` : ''}`}
                        style={attn ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
                          active
                            ? 'bg-accentBg text-accent ring-1 ring-inset ring-accentBorder'
                            : attn
                              ? 'attention-pulse text-fg'
                              : 'text-fgdim hover:bg-hover hover:text-fg'
                        }`}
                      >
                        {initial(ws.name)}
                        {busy ? (
                          <WorkingSpinner className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5" />
                        ) : attn ? (
                          <span
                            style={{ '--attn': attentionColor } as CSSProperties}
                            className="attention-pulse-dot absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-bar"
                          />
                        ) : (
                          n > 0 && (
                            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-bar bg-status" />
                          )
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </nav>
        {update.info?.updateAvailable && (
          <div className="shrink-0 border-t border-edge p-2">
            <button
              onClick={
                update.progress.phase === 'downloaded'
                  ? update.installAndRestart
                  : update.progress.phase === 'error'
                    ? () => window.api.openReleasePage(update.info?.releaseUrl ?? '')
                    : update.progress.phase === 'downloading'
                      ? undefined
                      : update.startDownload
              }
              disabled={update.progress.phase === 'downloading'}
              title={updateTitle(update, t)}
              aria-label={updateTitle(update, t)}
              className="relative mx-auto flex h-8 w-8 items-center justify-center rounded-md text-accent transition hover:bg-hover disabled:cursor-default disabled:opacity-70"
            >
              {update.progress.phase === 'downloading' ? (
                <WorkingSpinner className="h-4 w-4" />
              ) : (
                <UpdateGlyph />
              )}
              <span
                className={`absolute right-0.5 top-0.5 h-2 w-2 rounded-full border-2 border-bar ${
                  update.progress.phase === 'downloaded' ? 'bg-status' : 'bg-accent'
                }`}
              />
            </button>
          </div>
        )}
        <div className="shrink-0 border-t border-edge p-2">
          <button
            onClick={onOpenSettings}
            title={shortcutTitle(t('sidebar.settings'), 'openSettings')}
            aria-label={t('sidebar.settings')}
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <GearIcon size={18} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="superior-sidebar flex w-64 shrink-0 select-none flex-col overflow-hidden bg-bar transition-[width] duration-200 ease-out"
    >
      {overlays}
      <div className="border-b border-edge px-3 pb-3 pt-3">
        <button
          onClick={onOpenProject}
          className="flex w-full items-center gap-2 rounded-full border border-accentBorder bg-accentBg px-3 py-2 text-sm font-bold text-accent transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span className="flex h-5 w-5 items-center justify-center text-base leading-none text-accent">
            +
          </span>
          {t('sidebar.openProject')}
        </button>
        {workspaceToolsVisible && (
          <div className="mt-2 space-y-1.5">
            <div className="relative">
              <SearchIcon
                size={13}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fgmuted"
              />
              <input
                value={workspaceQuery}
                onChange={(event) => setWorkspaceQuery(event.target.value)}
                placeholder={t('sidebar.searchWorkspaces')}
                aria-label={t('sidebar.searchWorkspaces')}
                className="h-8 w-full rounded-full border border-edge bg-panel pl-8 pr-7 text-xs text-fg shadow-xs placeholder:text-fgmuted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              {workspaceQuery && (
                <button
                  type="button"
                  onClick={() => setWorkspaceQuery('')}
                  aria-label={t('sidebar.clearSearch')}
                  title={t('sidebar.clearSearch')}
                  className="absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-fgmuted hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  ×
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFavoritesOnly((value) => !value)}
                aria-pressed={favoritesOnly}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${favoritesOnly ? 'bg-accentBg text-accent' : 'text-fgmuted hover:bg-hover hover:text-fg'}`}
              >
                <StarIcon size={12} className={favoritesOnly ? 'fill-current' : ''} />
                {t('sidebar.filterFavorites')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceQuery('')
                  setFavoritesOnly(false)
                }}
                className="rounded px-1.5 py-1 text-[11px] text-fgmuted hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('sidebar.showAll')}
              </button>
            </div>
          </div>
        )}
      </div>

      <nav ref={navRef} className="min-h-0 flex-1 overflow-y-auto py-2">
        {folders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
            <p className="text-xs leading-5 text-fgmuted">{t('sidebar.noWorkspaces')}</p>
            <button
              onClick={onOpenProject}
              className="rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('sidebar.openProject')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaceToolsVisible &&
              !workspaceQuery &&
              !favoritesOnly &&
              recentWorkspaces.length > 0 && (
              <div className="border-b border-edge px-3 pb-2">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-fgmuted">
                  {t('sidebar.recentlyVisited')}
                </div>
                <div className="space-y-0.5">
                  {recentWorkspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => selectWorkspace(workspace.id)}
                      className="flex min-h-7 w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {filteredWorkspaceIds.size === 0 ? (
              <div className="px-3 py-8 text-center text-xs leading-5 text-fgmuted">
                {t('sidebar.noMatches')}
              </div>
            ) : (
            displayFolders.map((folder, folderIndex) => {
              const folderWorkspaces = workspaces.filter(
                (w) => w.folderPath === folder.path && filteredWorkspaceIds.has(w.id)
              )
              const open = !folder.collapsed
              const folderRunning = folderWorkspaces.reduce((a, w) => a + (counts[w.id] ?? 0), 0)
              const beingDragged = folderDrag?.path === folder.path
              if (folderWorkspaces.length === 0) return null
              return (
                <div
                  key={folder.path}
                  data-folder-path={folder.path}
                  style={folderTint(folder.color)}
                  className={`pb-2 ${
                    folderIndex > 0 ? 'border-t border-edge/65 pt-2' : ''
                  } ${beingDragged ? 'opacity-60 ring-1 ring-accentBorder' : ''}`}
                >
                  {/* Folder header — click to collapse / expand; the grip drags to reorder */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => toggleFolder(folder)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleFolder(folder)
                      } else if (e.key === 'ArrowLeft' && open) {
                        e.preventDefault()
                        toggleFolder(folder)
                      } else if (e.key === 'ArrowRight' && !open) {
                        e.preventDefault()
                        toggleFolder(folder)
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setFolderMenu({ path: folder.path, anchor: { x: e.clientX, y: e.clientY } })
                    }}
                    title={folderTitle(folder)}
                    className="group flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-fgdim transition hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
                  >
                    <span className="flex h-5 w-4 shrink-0 items-center justify-center text-fgmuted">
                      <ChevronIcon size={12} direction={open ? 'down' : 'right'} />
                    </span>
                    <span className="text-fgmuted">
                      <FolderGlyph folder={folder} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-fgdim">
                      {folderLabel(folder)}
                    </span>
                    <span
                      className="shrink-0 rounded-full bg-edge/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-fgmuted"
                    >
                      {folderWorkspaces.length}
                    </span>
                    {!open && folderRunning > 0 && (
                      <RunningBadge count={folderRunning} title={t('sidebar.runningTerminals')} />
                    )}
                    {/* Drag handle — the drag itself runs on window listeners
                        (see beginFolderDrag), the list live-reorders under the pointer. */}
                    <span
                      title={t('sidebar.reorderFolder')}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={beginFolderDrag(folder.path)}
                      className={`flex h-5 w-4 shrink-0 touch-none items-center justify-center text-fgmuted transition ${
                        beingDragged
                          ? 'cursor-grabbing opacity-100'
                          : 'cursor-grab opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                      }`}
                    >
                      <GripIcon size={12} />
                    </span>
                    {/* One kebab replaces the previous pencil + ✕ pair; right-click
                        opens the identical menu. */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setFolderMenu({ path: folder.path, anchor: e.currentTarget })
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
                      aria-label={t('menu.folderActions')}
                      title={t('menu.folderActions')}
                      aria-haspopup="menu"
                    >
                      <KebabIcon size={13} />
                    </button>
                  </div>

                  {/* Workspaces — indented under a tree guide line */}
                  {open && (
                    <ul className="ml-2 mt-1 space-y-0.5 border-l-2 border-edge/70 py-0.5">
                      {folderWorkspaces.map((ws) => {
                        const active = ws.id === activeWorkspaceId
                        const attn = attentionWorkspaceIds.has(ws.id)
                        return (
                          <li key={ws.id}>
                            <div
                              role="button"
                              tabIndex={0}
                              aria-current={active || undefined}
                              onClick={() => selectWorkspace(ws.id)}
                              onKeyDown={(e) => {
                                if (editingId === ws.id) return
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  selectWorkspace(ws.id)
                                } else if (e.key === 'F2') {
                                  e.preventDefault()
                                  startRename(ws)
                                } else if (e.key === 'ContextMenu') {
                                  e.preventDefault()
                                  setWsMenu({ id: ws.id, anchor: e.currentTarget })
                                }
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                setWsMenu({ id: ws.id, anchor: { x: e.clientX, y: e.clientY } })
                              }}
                              style={attn ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
                              className={`group relative mx-1 flex min-h-9 cursor-pointer items-center gap-2 rounded-lg py-1 pl-3 pr-2 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 ${
                                active
                                  ? 'bg-accentBg text-fg'
                                  : attn
                                    ? 'attention-pulse text-fg'
                                    : 'text-fg2 hover:bg-hover'
                              }`}
                            >
                              <span
                                style={attn ? { backgroundColor: attentionColor } : undefined}
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  active ? 'bg-accent' : attn ? '' : 'bg-fgmuted'
                                }`}
                              />
                              {active && (
                                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                              )}
                              {editingId === ws.id ? (
                                <input
                                  autoFocus
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onBlur={commitRename}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename()
                                    else if (e.key === 'Escape') setEditingId(null)
                                  }}
                                  className="min-w-0 flex-1 select-text rounded-sm border border-edge bg-panel px-1.5 py-0.5 text-sm text-fg focus:border-accent focus:outline-hidden"
                                />
                              ) : (
                                // Two-line row: name on top; branch + diff stat on a
                                // second, smaller line so nothing overlaps at 224px.
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span
                                    onDoubleClick={(e) => {
                                      e.stopPropagation()
                                      startRename(ws)
                                    }}
                                    className={`truncate text-sm ${
                                      active ? 'font-medium text-fg' : 'text-fg2'
                                    }`}
                                    // The tooltip shows the workspace itself (its branch/
                                    // path live only on the collapsed rail otherwise);
                                    // rename stays discoverable via the kebab menu.
                                    title={
                                      ws.branch ? `${ws.name} · ${ws.branch}` : ws.name
                                    }
                                  >
                                    {ws.name}
                                  </span>
                                  {(folder.kind === 'remote' || ws.branch || gitStats[ws.id]) && (
                                    <span className="flex min-w-0 items-center gap-2">
                                      {folder.kind === 'remote' && (
                                        <RemoteBadge title={folderTitle(folder)} />
                                      )}
                                      {ws.branch && (
                                        <BranchBadge
                                          branch={ws.branch}
                                          title={t('sidebar.worktreeBadge')}
                                        />
                                      )}
                                      {gitStats[ws.id] && (
                                        <DiffStat
                                          stat={gitStats[ws.id]}
                                          title={t('sidebar.diffStat')}
                                        />
                                      )}
                                    </span>
                                  )}
                                </div>
                              )}

                              {editingId !== ws.id && busyWorkspaceIds.has(ws.id) && (
                                <WorkingSpinner title={t('sidebar.workingTerminals')} />
                              )}

                              {/* Keep the two lightweight row actions discoverable. */}
                              {editingId !== ws.id && (
                                <>
                                  {workspaceToolsVisible && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleFavorite(ws.id)
                                      }}
                                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-fgmuted transition hover:bg-edge hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
                                        favoriteWorkspaceIds.has(ws.id)
                                          ? 'text-accent opacity-100'
                                          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                                      }`}
                                      aria-label={
                                        favoriteWorkspaceIds.has(ws.id)
                                          ? t('sidebar.unfavorite')
                                          : t('sidebar.favorite')
                                      }
                                      title={
                                        favoriteWorkspaceIds.has(ws.id)
                                          ? t('sidebar.unfavorite')
                                          : t('sidebar.favorite')
                                      }
                                      aria-pressed={favoriteWorkspaceIds.has(ws.id)}
                                    >
                                      <StarIcon
                                        size={12}
                                        className={favoriteWorkspaceIds.has(ws.id) ? 'fill-current' : ''}
                                      />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setWsMenu({ id: ws.id, anchor: e.currentTarget })
                                    }}
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
                                    aria-label={t('menu.workspaceActions')}
                                    title={t('menu.workspaceActions')}
                                    aria-haspopup="menu"
                                  >
                                    <KebabIcon size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </li>
                        )
                      })}

                    </ul>
                  )}
                </div>
              )
            })
            )}
          </div>
        )}
      </nav>
      {update.info?.updateAvailable && (
        <div className="shrink-0 border-t border-edge p-2">
          <div className="rounded-md bg-accentBg/50 px-2.5 py-2 ring-1 ring-inset ring-accentBorder">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg">
              <UpdateGlyph className="h-3.5 w-3.5 text-accent" />
              <span className="truncate">
                {t('update.available', { version: update.info.latestVersion ?? '' })}
              </span>
            </div>

            {update.progress.phase === 'downloading' ? (
              <>
                <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-edge">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${update.progress.percent ?? 0}%` }}
                  />
                </div>
                <button
                  disabled
                  className="w-full cursor-default rounded-md bg-accent/60 px-2 py-1 text-xs font-semibold text-bar"
                >
                  {t('update.downloading', { percent: String(update.progress.percent ?? 0) })}
                </button>
              </>
            ) : update.progress.phase === 'downloaded' ? (
              <button
                onClick={update.installAndRestart}
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('update.restart')}
              </button>
            ) : update.progress.phase === 'error' ? (
              <button
                onClick={() => window.api.openReleasePage(update.info?.releaseUrl ?? '')}
                title={t('update.failed')}
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('update.openPage')}
              </button>
            ) : (
              <button
                onClick={update.startDownload}
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('update.action')}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="shrink-0 border-t border-edge p-2">
        <button
          onClick={onOpenSettings}
          title={shortcutTitle(t('sidebar.settings'), 'openSettings')}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span className="flex h-5 w-5 items-center justify-center">
            <GearIcon size={17} />
          </span>
          {t('sidebar.settings')}
        </button>
      </div>
    </aside>
  )
})
