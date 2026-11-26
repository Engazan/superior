import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useAttentionColor } from '../attentionColor'
import {
  onWorkspaceActivity,
  primeWorkspaceActivity,
  useAgentSessionStates,
  useAgentWorkspaceStates,
  useAttentionWorkspaces,
  useBusyWorkspaces,
  useWorkspaceActivity
} from '../activityStore'
import { WORKSPACE_SORTS, mergeVisibleOrder, sortWorkspaces, type WorkspaceSort } from '../workspaceSort'
import { useWorkspaceDrag } from './sidebar/useWorkspaceDrag'
import {
  Button,
  CheckIcon,
  CloseIcon,
  EmptyState,
  ExternalLinkIcon,
  FolderIcon,
  GearIcon,
  IconButton,
  Menu,
  PencilIcon,
  PlusIcon,
  PhoneIcon,
  SearchIcon,
  ServerIcon,
  MonitorIcon,
  SlidersIcon,
  StarIcon,
  TrashIcon,
  type MenuItem
} from './ui'
import { useShortcutTitle } from '../shortcuts'
import { FolderHeader } from './sidebar/FolderHeader'
import { SidebarRail } from './sidebar/SidebarRail'
import { SessionList } from './sidebar/SessionList'
import { SidebarUpdate } from './sidebar/SidebarUpdate'
import { WorkspaceRow } from './sidebar/WorkspaceRow'
import { NeedsYou } from './sidebar/NeedsYou'
import { WorktreeSetup } from './WorktreeSetup'
import { WorkspaceCreateModal } from './sidebar/WorkspaceCreateModal'
import { FolderEditModal } from './sidebar/FolderEditModal'
import type { UpdateController } from '../hooks/useUpdateCheck'
import type { WorkspaceGitStat } from '../hooks/useWorkspaceGitStats'
import type { AgentSession, Folder, FolderUpdate, Workspace, WorktreeAddArgs } from '../types'

interface Props {
  folders: Folder[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelectSession: (session: AgentSession) => void
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
  onOpenMobileAccess: () => void
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

/** Host group a project belongs to in the sidebar: "local" or "ssh · <alias>". */
function folderHostLabel(folder: Folder, localLabel: string): string {
  return folder.kind === 'remote' && folder.remote ? `ssh · ${folder.remote.host}` : localLabel
}

/** The project's automatic workspace is implied by the project row. */
function defaultWorkspace(workspaces: Workspace[]): Workspace | undefined {
  const workspace = workspaces.length === 1 ? workspaces[0] : undefined
  return workspace?.name === 'Main' && !workspace.worktreePath ? workspace : undefined
}

export const Sidebar = memo(function Sidebar({
  folders,
  workspaces,
  activeWorkspaceId,
  sessions,
  activeSessionId,
  onSelectSession,
  counts,
  gitStats,
  update,
  collapsed,
  onExpand,
  onOpenProject,
  onOpenSettings,
  onOpenMobileAccess,
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
  const [setupWorkspaceId, setSetupWorkspaceId] = useState<string | null>(null)
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
  const [sortMode, setSortMode] = useState<WorkspaceSort>('recent')
  const [sortMenu, setSortMenu] = useState<HTMLElement | null>(null)
  const [manualOrder, setManualOrder] = useState<string[]>([])
  const workspaceActivity = useWorkspaceActivity()
  const agentWorkspaceStates = useAgentWorkspaceStates()
  const sessionStates = useAgentSessionStates()
  const sessionsByWorkspace = useMemo(() => {
    const groups = new Map<string, AgentSession[]>()
    for (const session of sessions) {
      const group = groups.get(session.workspaceId)
      if (group) group.push(session)
      else groups.set(session.workspaceId, [session])
    }
    return groups
  }, [sessions])
  // Re-rank once a minute so a new workspace's grace period can expire.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const sortContext = useMemo(
    () => ({
      now: Math.max(now, Date.now()),
      activity: workspaceActivity,
      agents: agentWorkspaceStates,
      attention: attentionWorkspaceIds,
      manualOrder
    }),
    [now, workspaceActivity, agentWorkspaceStates, attentionWorkspaceIds, manualOrder]
  )
  const sortedProject = (folderPath: string, include: (w: Workspace) => boolean = () => true): Workspace[] =>
    sortWorkspaces(workspaces.filter((w) => w.folderPath === folderPath && include(w)), sortMode, sortContext)

  // Dropping a dragged workspace pins the exact order and switches to Manual, like Orca.
  const commitWorkspaceOrder = (folderPath: string, visibleOrder: string[]): void => {
    const ids = (path: string): string[] => sortedProject(path).map((w) => w.id)
    const next = folders.flatMap((f) => (f.path === folderPath ? mergeVisibleOrder(ids(f.path), visibleOrder) : ids(f.path)))
    setManualOrder(next)
    setSortMode('manual')
    void window.api.setUiState({ workspaceSort: 'manual', workspaceOrder: next })
  }
  const navRef = useRef<HTMLElement | null>(null)
  const { drag: workspaceDrag, begin: beginWorkspaceDrag } = useWorkspaceDrag(navRef, commitWorkspaceOrder)
  const projectWorkspaces = (folderPath: string, include: (w: Workspace) => boolean = () => true): Workspace[] => {
    const list = sortedProject(folderPath, include)
    if (workspaceDrag?.folderPath !== folderPath) return list
    const rank = new Map(workspaceDrag.order.map((id, index) => [id, index]))
    return [...list].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  }

  // Persist activity so Recent survives restarts; only existing workspaces are kept.
  const workspaceIdsRef = useRef(new Set<string>())
  workspaceIdsRef.current = new Set(workspaces.map((w) => w.id))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = onWorkspaceActivity((activity) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const entries = [...activity].filter(([id]) => workspaceIdsRef.current.has(id))
        void window.api.setUiState({ workspaceActivity: Object.fromEntries(entries) })
      }, 2_000)
    })
    return () => { off(); clearTimeout(timer) }
  }, [])

  useEffect(() => {
    void window.api.getSettings().then((settings) => {
      setFavoriteWorkspaceIds(new Set(settings.ui.favoriteWorkspaceIds ?? []))
      setRecentWorkspaceIds(settings.ui.recentWorkspaceIds ?? [])
      setWorkspaceToolsVisible(settings.ui.sidebarWorkspaceTools)
      setSortMode(settings.ui.workspaceSort ?? 'recent')
      setManualOrder(settings.ui.workspaceOrder ?? [])
      primeWorkspaceActivity(settings.ui.workspaceActivity ?? {})
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
    const folder = folders.find((item) => item.path === ws.folderPath)
    if (folder?.collapsed) toggleFolder(folder)
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
      icon: <PlusIcon size={13} />,
      onSelect: () => startAdd(folder.path)
    },
    'separator',
    {
      id: 'remove-folder',
      label: t('sidebar.removeFolder'),
      icon: <TrashIcon size={13} />,
      tone: 'danger',
      onSelect: () => onRemoveFolder(folder.path)
    }
  ]

  const sortLabels: Record<WorkspaceSort, string> = {
    recent: t('sidebar.sortRecent'),
    smart: t('sidebar.sortSmart'),
    name: t('sidebar.sortName'),
    manual: t('sidebar.sortManual')
  }
  const sortMenuItems: MenuItem[] = [
    ...WORKSPACE_SORTS.map((mode) => ({
      id: mode,
      label: sortLabels[mode],
      icon: mode === sortMode ? <CheckIcon size={13} /> : <span className="inline-block w-[13px]" />,
      onSelect: () => {
        setSortMode(mode)
        void window.api.setUiState({ workspaceSort: mode })
      }
    })),
    'separator',
    {
      id: 'mobile-access',
      label: t('sidebar.mobileAccess'),
      icon: <PhoneIcon size={13} />,
      onSelect: onOpenMobileAccess
    }
  ]

  /** The workspace actions offered by both the kebab and the right-click menu. */
  const wsMenuItems = (ws: Workspace): MenuItem[] => [
    ...(folders.find(f => f.path === ws.folderPath)?.kind !== 'remote' ? [{
      id: 'setup',
      label: t('setup.configure'),
      icon: <GearIcon size={13} />,
      onSelect: () => setSetupWorkspaceId(ws.id)
    }] : []),
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
  const menuFolderWorkspace = menuFolder ? defaultWorkspace(projectWorkspaces(menuFolder.path)) : undefined
  const inlineWorkspaceActions = menuFolderWorkspace ? wsMenuItems(menuFolderWorkspace) : []
  if (menuFolderWorkspace && workspaceToolsVisible) {
    const favorite = favoriteWorkspaceIds.has(menuFolderWorkspace.id)
    inlineWorkspaceActions.unshift({
      id: 'favorite',
      label: t(favorite ? 'sidebar.unfavorite' : 'sidebar.favorite'),
      icon: <StarIcon size={13} />,
      onSelect: () => toggleFavorite(menuFolderWorkspace.id)
    })
  }
  const addingFolder = addingFor ? folders.find((f) => f.path === addingFor) ?? null : null
  const setupWorkspace = workspaces.find(w => w.id === setupWorkspaceId && folders.find(f => f.path === w.folderPath)?.kind !== 'remote')
  const overlays = (
    <>
      {setupWorkspace && <WorktreeSetup key={setupWorkspace.id} workspace={setupWorkspace} onClose={() => setSetupWorkspaceId(null)} />}
      {folderMenu && menuFolder && (
        <Menu
          items={[
            ...folderMenuItems(menuFolder),
            ...(inlineWorkspaceActions.length > 0 ? ['separator' as const, ...inlineWorkspaceActions] : [])
          ]}
          anchor={folderMenu.anchor}
          onClose={() => setFolderMenu(null)}
        />
      )}
      {sortMenu && <Menu items={sortMenuItems} anchor={sortMenu} onClose={() => setSortMenu(null)} />}
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

  if (collapsed) {
    return (
      <SidebarRail
        folders={folders}
        projectWorkspaces={(path) => projectWorkspaces(path)}
        activeWorkspaceId={activeWorkspaceId}
        busyWorkspaceIds={busyWorkspaceIds}
        attentionWorkspaceIds={attentionWorkspaceIds}
        attentionColor={attentionColor}
        update={update}
        overlays={overlays}
        onSelectWorkspace={selectWorkspace}
        onExpand={onExpand}
        onOpenProject={onOpenProject}
        onOpenSettings={onOpenSettings}
        onOpenMobileAccess={onOpenMobileAccess}
        onFolderMenu={(path, anchor) => setFolderMenu({ path, anchor })}
        onWorkspaceMenu={(id, anchor) => setWsMenu({ id, anchor })}
      />
    )
  }

  // A folder with no workspaces stays listed (so one can be added back); only
  // an active search/favorites filter hides projects without matches.
  const filterActive = !!normalizedQuery || favoritesOnly
  // Host headers only help once SSH projects sit next to local ones.
  const showHostGroups = displayFolders.some((folder) => folder.kind === 'remote')
  const clearFilters = (): void => {
    setWorkspaceQuery('')
    setFavoritesOnly(false)
  }

  return (
    <aside
      className="superior-sidebar superior-sidebar--expanded flex w-60 shrink-0 select-none flex-col overflow-hidden bg-bar transition-[width] duration-200 ease-out"
    >
      {overlays}
      <NeedsYou
        sessions={sessions}
        workspaces={workspaces}
        attentionColor={attentionColor}
        onSelectSession={onSelectSession}
      />
      <div className="px-3 pt-4">
        <div className="group/heading flex h-7 items-center gap-1 px-1.5">
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fgmuted">
            {t('sidebar.workspaces')}
          </span>
          <IconButton
            type="button"
            size="sm"
            onClick={(e) => setSortMenu(e.currentTarget)}
            label={t('sidebar.sortBy')}
            title={`${t('sidebar.sortBy')}: ${sortLabels[sortMode]}`}
            className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/heading:opacity-100 aria-expanded:opacity-100"
            aria-haspopup="menu"
            aria-expanded={sortMenu !== null}
          >
            <SlidersIcon size={14} />
          </IconButton>
          <IconButton type="button" size="md" onClick={onOpenProject} label={t('sidebar.openProject')}>
            <PlusIcon size={15} />
          </IconButton>
        </div>
        {workspaceToolsVisible && (
          <div className="mt-2 space-y-1.5">
            <div className="relative">
              <SearchIcon
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fgmuted"
              />
              <input
                value={workspaceQuery}
                onChange={(event) => setWorkspaceQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && workspaceQuery) {
                    event.stopPropagation()
                    setWorkspaceQuery('')
                  }
                }}
                placeholder={t('sidebar.searchWorkspaces')}
                aria-label={t('sidebar.searchWorkspaces')}
                className="h-8 w-full rounded-md border border-edge bg-panel pl-8 pr-8 text-xs text-fg shadow-xs placeholder:text-fgmuted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              {workspaceQuery && (
                <IconButton
                  type="button"
                  size="sm"
                  onClick={() => setWorkspaceQuery('')}
                  label={t('sidebar.clearSearch')}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                >
                  <CloseIcon size={12} />
                </IconButton>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFavoritesOnly((value) => !value)}
                aria-pressed={favoritesOnly}
                className={`flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${favoritesOnly ? 'bg-accentBg text-accent' : 'text-fgmuted hover:bg-hover hover:text-fg'}`}
              >
                <StarIcon size={12} className={favoritesOnly ? 'fill-current' : ''} />
                {t('sidebar.filterFavorites')}
              </button>
              <button
                type="button"
                onClick={clearFilters}
                disabled={!filterActive}
                className="flex h-6 items-center rounded-full px-2 text-[11px] font-medium text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fgmuted"
              >
                {t('sidebar.showAll')}
              </button>
            </div>
          </div>
        )}
      </div>

      <nav ref={navRef} aria-label={t('sidebar.workspaces')} className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-[18px]">
        {folders.length === 0 ? (
          <div className="px-2 pt-2">
            <EmptyState
              icon={<FolderIcon size={18} />}
              title={t('sidebar.noWorkspaces')}
              action={
                <Button type="button" variant="secondary" size="sm" onClick={onOpenProject}>
                  <PlusIcon size={13} />
                  {t('sidebar.openProject')}
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {workspaceToolsVisible && !filterActive && recentWorkspaces.length > 0 && (
              <div className="border-b border-edge pb-2">
                <div className="flex h-7 items-center px-2 text-xs font-semibold text-fgmuted">
                  {t('sidebar.recentlyVisited')}
                </div>
                <div className="space-y-px">
                  {recentWorkspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => selectWorkspace(workspace.id)}
                      aria-current={workspace.id === activeWorkspaceId || undefined}
                      title={workspace.name}
                      className="flex min-h-7 w-full items-center gap-2 rounded-md py-1 pl-4 pr-1 text-left text-[13px] leading-4 text-fg2 transition hover:bg-hover/70 hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
                    >
                      <span aria-hidden className="flex w-3.5 shrink-0 justify-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {filterActive && filteredWorkspaceIds.size === 0 ? (
              <div className="px-2 pt-2">
                <EmptyState
                  icon={<SearchIcon size={18} />}
                  title={t('sidebar.noMatches')}
                  action={
                    <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                      {t('sidebar.showAll')}
                    </Button>
                  }
                />
              </div>
            ) : (
            displayFolders.map((folder, folderIndex) => {
              const hostLabel = showHostGroups ? folderHostLabel(folder, t('sidebar.hostLocal')) : null
              const showHostHeader =
                hostLabel !== null &&
                (folderIndex === 0 || folderHostLabel(displayFolders[folderIndex - 1], t('sidebar.hostLocal')) !== hostLabel)
              const allWorkspaces = projectWorkspaces(folder.path)
              const folderWorkspaces = allWorkspaces.filter((workspace) => filteredWorkspaceIds.has(workspace.id))
              if (folderWorkspaces.length === 0 && filterActive) return null

              const mainWorkspace = defaultWorkspace(allWorkspaces)
              const directWorkspace = mainWorkspace?.id !== editingId ? mainWorkspace : undefined
              const folderActive = allWorkspaces.some((w) => w.id === activeWorkspaceId)
              const directSessions = directWorkspace && folderActive ? sessionsByWorkspace.get(directWorkspace.id) ?? [] : []
              const expandable = !directWorkspace || directSessions.length > 0
              const open = expandable && !folder.collapsed
              const folderRunning = allWorkspaces.some((w) => (counts[w.id] ?? 0) > 0)
              const waitingCount = allWorkspaces.reduce((total, w) =>
                total + (sessionsByWorkspace.get(w.id) ?? []).filter((session) => sessionStates.get(session.id) === 'waiting').length,
              0)
              const beingDragged = folderDrag?.path === folder.path
              const activate = (): void => {
                if (directWorkspace && !folderActive) {
                  selectWorkspace(directWorkspace.id)
                  if (folder.collapsed) toggleFolder(folder)
                } else if (expandable) {
                  toggleFolder(folder)
                }
              }
              return (
                <div
                  key={folder.path}
                  data-folder-path={folder.path}
                  className={beingDragged ? 'rounded-lg opacity-60 ring-1 ring-accentBorder' : undefined}
                >
                  {showHostHeader && (
                    <div className="flex h-7 items-center gap-1.5 px-2.5 pt-2 font-mono text-[11px] text-fgmuted">
                      {folder.kind === 'remote' ? <ServerIcon size={12} /> : <MonitorIcon size={12} />}
                      <span className="truncate">{hostLabel}</span>
                    </div>
                  )}
                  <FolderHeader
                    folder={folder}
                    open={open}
                    active={folderActive}
                    dragging={beingDragged}
                    expandable={expandable}
                    waitingCount={waitingCount}
                    running={folderRunning}
                    onActivate={activate}
                    onToggle={() => toggleFolder(folder)}
                    onMenu={(anchor) => setFolderMenu({ path: folder.path, anchor })}
                    onAddWorkspace={() => startAdd(folder.path)}
                    onGripPointerDown={beginFolderDrag(folder.path)}
                  />

                  {open && (
                    <div className="superior-sidebar-tree ml-[22px] mt-1 border-l border-edge py-1">
                      {directWorkspace ? (
                        <SessionList sessions={directSessions} activeSessionId={activeSessionId}
                          onSelect={onSelectSession} className="pl-2" />
                      ) : (
                        <ul className="space-y-0.5 pl-2">
                          {folderWorkspaces.map((ws) => (
                            <WorkspaceRow
                              key={ws.id}
                              ws={ws}
                              folder={folder}
                              active={ws.id === activeWorkspaceId}
                              sessions={ws.id === activeWorkspaceId ? sessionsByWorkspace.get(ws.id) ?? [] : []}
                              allSessions={sessionsByWorkspace.get(ws.id) ?? []}
                              activeSessionId={activeSessionId}
                              onSelectSession={onSelectSession}
                              dragging={workspaceDrag?.id === ws.id}
                              attention={attentionWorkspaceIds.has(ws.id)}
                              busy={busyWorkspaceIds.has(ws.id)}
                              attentionColor={attentionColor}
                              runningCount={counts[ws.id] ?? 0}
                              stat={gitStats[ws.id]}
                              editing={editingId === ws.id}
                              draft={draft}
                              onDraftChange={setDraft}
                              onCommitRename={commitRename}
                              onCancelRename={() => setEditingId(null)}
                              favorite={workspaceToolsVisible ? favoriteWorkspaceIds.has(ws.id) : null}
                              onToggleFavorite={() => toggleFavorite(ws.id)}
                              onPointerDown={beginWorkspaceDrag(folder.path, ws.id, folderWorkspaces.map((w) => w.id))}
                              onSelect={() => selectWorkspace(ws.id)}
                              onStartRename={() => startRename(ws)}
                              onMenu={(anchor) => setWsMenu({ id: ws.id, anchor })}
                            />
                          ))}
                          {/* An emptied project keeps a direct way to add a workspace back. */}
                          {folderWorkspaces.length === 0 && (
                            <li>
                              <button
                                type="button"
                                onClick={() => startAdd(folder.path)}
                                className="flex min-h-7 w-full items-center gap-2 rounded-md py-1 pl-4 pr-1 text-left text-[13px] leading-4 text-fgmuted transition hover:bg-hover/70 hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
                              >
                                <span aria-hidden className="flex w-3.5 shrink-0 justify-center">
                                  <PlusIcon size={12} />
                                </span>
                                {t('sidebar.addWorkspace')}
                              </button>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            })
            )}
          </div>
        )}
      </nav>
      <SidebarUpdate update={update} />
      <div className="shrink-0 px-3 pb-4">
        <button
          type="button"
          onClick={onOpenSettings}
          title={shortcutTitle(t('sidebar.settings'), 'openSettings')}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <GearIcon size={16} />
          {t('sidebar.settings')}
        </button>
      </div>
    </aside>
  )
})
