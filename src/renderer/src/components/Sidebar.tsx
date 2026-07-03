import { memo, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { panelTint } from '../tint'
import { useAttentionColor } from '../attentionColor'
import { useBusyWorkspaces, useAttentionWorkspaces } from '../activityStore'
import {
  ChevronIcon,
  ExternalLinkIcon,
  GripIcon,
  KebabIcon,
  Menu,
  PencilIcon,
  TrashIcon,
  type MenuItem
} from './ui'
import {
  BranchBadge,
  DiffStat,
  FolderGlyph,
  RunningBadge,
  UpdateGlyph,
  WorkingSpinner,
  folderLabel,
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
  /** Hex tint of the active profile; washes the whole rail when set. */
  tintColor?: string | null
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
  tintColor,
  folders,
  workspaces,
  activeWorkspaceId,
  counts,
  gitStats,
  update,
  collapsed,
  onExpand,
  onOpenProject,
  onRemoveFolder,
  onReorderFolders,
  onUpdateFolder,
  onAddWorkspace,
  onAddWorktreeWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onSelectWorkspace
}: Props): JSX.Element {
  const { t } = useI18n()
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
  // Drag-to-reorder: the folder being dragged and the one currently hovered.
  const [draggingFolder, setDraggingFolder] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  // Move `dragged` to `target`'s slot and persist the resulting folder order.
  const dropFolder = (dragged: string, target: string): void => {
    setDragOverFolder(null)
    setDraggingFolder(null)
    if (dragged === target) return
    const paths = folders.map((f) => f.path)
    const from = paths.indexOf(dragged)
    const to = paths.indexOf(target)
    if (from === -1 || to === -1) return
    paths.splice(from, 1)
    paths.splice(to, 0, dragged)
    onReorderFolders(paths)
  }

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
        style={panelTint(tintColor)}
        className="flex w-14 shrink-0 flex-col items-stretch overflow-hidden border-r border-edge bg-bar transition-[width] duration-200 ease-out"
      >
        {overlays}
        <div className="flex flex-col items-center gap-1 border-b border-edge p-2">
          <button
            onClick={onOpenProject}
            title={t('sidebar.openProject')}
            aria-label={t('sidebar.openProject')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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
                      if (folderWorkspaces[0]) onSelectWorkspace(folderWorkspaces[0].id)
                      else onExpand()
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setFolderMenu({ path: folder.path, anchor: { x: e.clientX, y: e.clientY } })
                    }}
                    title={folderLabel(folder)}
                    aria-label={folderLabel(folder)}
                    style={folderTint(folder.color)}
                    className="relative flex h-7 w-8 items-center justify-center rounded-md text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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
                        onClick={() => onSelectWorkspace(ws.id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setWsMenu({ id: ws.id, anchor: { x: e.clientX, y: e.clientY } })
                        }}
                        title={`${folder.name} / ${ws.name}${ws.branch ? ` · ${ws.branch}` : ''}`}
                        style={attn ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
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
      </aside>
    )
  }

  return (
    <aside
      style={panelTint(tintColor)}
      className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-edge bg-bar transition-[width] duration-200 ease-out"
    >
      {overlays}
      <div className="border-b border-edge px-2 py-2">
        <button
          onClick={onOpenProject}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <span className="flex h-5 w-5 items-center justify-center text-base leading-none text-accent">
            +
          </span>
          {t('sidebar.openProject')}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-2">
        {folders.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs leading-5 text-fgmuted">
            {t('sidebar.noWorkspaces')}
          </p>
        ) : (
          <div className="space-y-3">
            {folders.map((folder) => {
              const folderWorkspaces = workspaces.filter((w) => w.folderPath === folder.path)
              const open = !folder.collapsed
              const folderRunning = folderWorkspaces.reduce((a, w) => a + (counts[w.id] ?? 0), 0)
              return (
                <div
                  key={folder.path}
                  style={folderTint(folder.color)}
                  className={folder.color ? 'rounded-lg p-1' : undefined}
                >
                  {/* Folder header — click to collapse / expand, drag to reorder */}
                  <div
                    draggable
                    onClick={() => toggleFolder(folder)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setFolderMenu({ path: folder.path, anchor: { x: e.clientX, y: e.clientY } })
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', folder.path)
                      setDraggingFolder(folder.path)
                    }}
                    onDragOver={(e) => {
                      if (!draggingFolder || draggingFolder === folder.path) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverFolder !== folder.path) setDragOverFolder(folder.path)
                    }}
                    onDragLeave={() => {
                      if (dragOverFolder === folder.path) setDragOverFolder(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const dragged = e.dataTransfer.getData('text/plain') || draggingFolder
                      if (dragged) dropFolder(dragged, folder.path)
                    }}
                    onDragEnd={() => {
                      setDraggingFolder(null)
                      setDragOverFolder(null)
                    }}
                    title={folder.path}
                    className={`group flex cursor-pointer items-center gap-1.5 px-2 py-1 text-fgdim transition hover:bg-hover ${
                      draggingFolder === folder.path ? 'opacity-40' : ''
                    } ${
                      dragOverFolder === folder.path && draggingFolder !== folder.path
                        ? 'ring-1 ring-inset ring-accentBorder'
                        : ''
                    }`}
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
                    {!open && folderRunning > 0 && (
                      <RunningBadge count={folderRunning} title={t('sidebar.runningTerminals')} />
                    )}
                    <span
                      title={t('sidebar.reorderFolder')}
                      aria-hidden
                      className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-fgmuted opacity-0 transition group-hover:opacity-100"
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
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                      aria-label={t('menu.folderActions')}
                      title={t('menu.folderActions')}
                      aria-haspopup="menu"
                    >
                      <KebabIcon size={13} />
                    </button>
                  </div>

                  {/* Workspaces — indented under a tree guide line */}
                  {open && (
                    <ul className="mt-0.5 space-y-0.5 border-l border-edge">
                      {folderWorkspaces.map((ws) => {
                        const active = ws.id === activeWorkspaceId
                        const attn = attentionWorkspaceIds.has(ws.id)
                        return (
                          <li key={ws.id}>
                            <div
                              onClick={() => onSelectWorkspace(ws.id)}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                setWsMenu({ id: ws.id, anchor: { x: e.clientX, y: e.clientY } })
                              }}
                              style={attn ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
                              className={`group relative flex min-h-8 cursor-pointer items-center gap-2 py-1 pl-4 pr-2 transition ${
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
                                  className="min-w-0 flex-1 rounded border border-edge bg-panel px-1.5 py-0.5 text-sm text-fg focus:border-accent focus:outline-none"
                                />
                              ) : (
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span
                                    onDoubleClick={(e) => {
                                      e.stopPropagation()
                                      startRename(ws)
                                    }}
                                    className={`truncate text-sm ${
                                      active ? 'font-medium text-fg' : 'text-fg2'
                                    }`}
                                    title={t('sidebar.renameWorkspace')}
                                  >
                                    {ws.name}
                                  </span>
                                  {ws.branch && (
                                    <BranchBadge branch={ws.branch} title={t('sidebar.worktreeBadge')} />
                                  )}
                                </div>
                              )}

                              {editingId !== ws.id && busyWorkspaceIds.has(ws.id) && (
                                <WorkingSpinner title={t('sidebar.workingTerminals')} />
                              )}
                              {editingId !== ws.id && gitStats[ws.id] && (
                                <DiffStat stat={gitStats[ws.id]} title={t('sidebar.diffStat')} />
                              )}

                              {/* One kebab replaces the previous reveal/rename/remove trio;
                                  always visible on the active row so the affordance is
                                  discoverable, hover/focus reveals it elsewhere. */}
                              {editingId !== ws.id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setWsMenu({ id: ws.id, anchor: e.currentTarget })
                                  }}
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-fgmuted transition hover:bg-edge hover:text-fg focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 ${
                                    active ? 'opacity-100' : 'opacity-0'
                                  }`}
                                  aria-label={t('menu.workspaceActions')}
                                  title={t('menu.workspaceActions')}
                                  aria-haspopup="menu"
                                >
                                  <KebabIcon size={13} />
                                </button>
                              )}
                            </div>
                          </li>
                        )
                      })}

                      {/* One entry point for plain and branch-isolated workspaces. */}
                      <li>
                        <button
                          onClick={() => startAdd(folder.path)}
                          className="flex w-full items-center gap-2 py-1.5 pl-4 pr-2 text-xs text-fgmuted transition hover:bg-hover hover:text-fg"
                        >
                          <span className="text-sm leading-none text-accent">+</span>
                          {t('sidebar.addWorkspace')}
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
              )
            })}
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
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('update.restart')}
              </button>
            ) : update.progress.phase === 'error' ? (
              <button
                onClick={() => window.api.openReleasePage(update.info?.releaseUrl ?? '')}
                title={t('update.failed')}
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('update.openPage')}
              </button>
            ) : (
              <button
                onClick={update.startDownload}
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('update.action')}
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  )
})
