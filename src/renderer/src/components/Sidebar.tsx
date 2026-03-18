import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { BranchInfo, Folder, Workspace, WorktreeAddArgs } from '../types'

interface Props {
  folders: Folder[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  /** running-terminal count per workspace id */
  counts: Record<string, number>
  collapsed: boolean
  onAddFolder: () => void
  onRemoveFolder: (path: string) => void
  onAddWorkspace: (folderPath: string, name: string) => void
  /** Create a worktree-backed workspace; resolves true when it succeeded. */
  onAddWorktreeWorkspace: (args: WorktreeAddArgs) => Promise<boolean>
  onRenameWorkspace: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => void
  onSelectWorkspace: (id: string) => void
}

function initial(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase()
}

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function FolderIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function RunningBadge({ count, title }: { count: number; title: string }): JSX.Element {
  return (
    <span
      title={title}
      className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-statusBg px-1.5 text-[10px] font-bold leading-none text-status ring-1 ring-inset ring-statusBorder"
    >
      {count}
    </span>
  )
}

function BranchGlyph(): JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="4" cy="3.5" r="1.75" />
      <circle cx="4" cy="12.5" r="1.75" />
      <circle cx="12" cy="5.5" r="1.75" />
      <path d="M4 5.25v5.5M10.25 5.5H9A5 5 0 0 0 4 10.5" />
    </svg>
  )
}

/** Small branch chip shown under a worktree-backed workspace's name. */
function BranchBadge({ branch, title }: { branch: string; title: string }): JSX.Element {
  return (
    <span
      title={title}
      className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-medium text-fgmuted"
    >
      <BranchGlyph />
      <span className="truncate">{branch}</span>
    </span>
  )
}

/**
 * Inline form to create a worktree-backed workspace: a name, a new-vs-existing
 * branch toggle, and the branch itself (free text for new, a picker of
 * not-checked-out branches for existing). Submits via `onCreate`; closes on
 * success.
 */
function WorktreeCreateForm({
  folderPath,
  onCancel,
  onCreate
}: {
  folderPath: string
  onCancel: () => void
  onCreate: (args: WorktreeAddArgs) => Promise<boolean>
}): JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [newBranch, setNewBranch] = useState('')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [picked, setPicked] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.listBranches(folderPath).then((list) => {
      if (!active) return
      setBranches(list)
      setPicked(list.find((b) => !b.isCheckedOut)?.name ?? '')
    })
    return () => {
      active = false
    }
  }, [folderPath])

  const available = branches.filter((b) => !b.isCheckedOut)
  const branch = mode === 'new' ? newBranch.trim() : picked
  const canSubmit = !!branch && !busy

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setBusy(true)
    const ok = await onCreate({
      folderPath,
      name: name.trim() || branch,
      branch,
      createBranch: mode === 'new'
    })
    setBusy(false)
    if (ok) onCancel()
  }

  const field =
    'w-full rounded border border-edge bg-panel px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none'
  const seg = (on: boolean): string =>
    `flex-1 rounded px-2 py-1 text-[11px] font-medium transition ${
      on ? 'bg-accentBg text-accent' : 'text-fgmuted hover:bg-hover hover:text-fg'
    }`

  return (
    <div className="space-y-1.5 rounded-md border border-edge bg-panel/40 p-1.5">
      <input
        autoFocus
        value={name}
        placeholder={t('sidebar.newWorkspacePlaceholder')}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className={field}
      />
      <div className="flex gap-1 rounded border border-edge p-0.5">
        <button className={seg(mode === 'new')} onClick={() => setMode('new')}>
          {t('sidebar.createNewBranch')}
        </button>
        <button className={seg(mode === 'existing')} onClick={() => setMode('existing')}>
          {t('sidebar.useExistingBranch')}
        </button>
      </div>
      {mode === 'new' ? (
        <input
          value={newBranch}
          placeholder={t('sidebar.worktreeBranchPlaceholder')}
          onChange={(e) => setNewBranch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            else if (e.key === 'Escape') onCancel()
          }}
          className={field}
        />
      ) : (
        <select value={picked} onChange={(e) => setPicked(e.target.value)} className={field}>
          {available.length === 0 && <option value="">—</option>}
          {available.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.isCurrent ? ' ✓' : ''}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-1">
        <button
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-accentBg px-2 py-1 text-xs font-medium text-accent transition hover:brightness-125 disabled:opacity-40"
        >
          <BranchGlyph />
          {t('sidebar.addWorktreeWorkspace')}
        </button>
        <button
          onClick={onCancel}
          aria-label="✕"
          className="shrink-0 rounded px-2 py-1 text-xs text-fgmuted transition hover:bg-hover hover:text-fg"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function Sidebar({
  folders,
  workspaces,
  activeWorkspaceId,
  counts,
  collapsed,
  onAddFolder,
  onRemoveFolder,
  onAddWorkspace,
  onAddWorktreeWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onSelectWorkspace
}: Props): JSX.Element {
  const { t } = useI18n()
  // Inline editors: which workspace is being renamed, which folder is adding a
  // plain workspace, and which folder is creating a worktree-backed one.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [worktreeFor, setWorktreeFor] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Folders the user has collapsed (rolled up) in the sidebar.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  const toggleFolder = (path: string): void =>
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

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
    setWorktreeFor(null)
    setAddingFor(folderPath)
    setDraft('')
  }
  const commitAdd = (): void => {
    const name = draft.trim()
    if (addingFor && name) onAddWorkspace(addingFor, name)
    setAddingFor(null)
    setDraft('')
  }

  // Collapsed: a narrow rail with workspace initials + a running-count dot.
  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-stretch overflow-hidden border-r border-edge bg-bar transition-[width] duration-200 ease-out">
        <div className="flex flex-col items-center border-b border-edge p-2">
          <button
            onClick={onAddFolder}
            title={t('sidebar.openFolder')}
            aria-label={t('sidebar.openFolder')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            +
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          <div className="flex flex-col items-center gap-2">
            {folders.map((folder, i) => {
              const folderWorkspaces = workspaces.filter((w) => w.folderPath === folder.path)
              const folderRunning = folderWorkspaces.reduce((a, w) => a + (counts[w.id] ?? 0), 0)
              return (
                <div key={folder.path} className="flex w-full flex-col items-center gap-1.5">
                  {i > 0 && <div className="my-1 h-px w-6 bg-edge" />}

                  {/* Project marker — folder glyph; jumps to its first workspace */}
                  <button
                    onClick={() => folderWorkspaces[0] && onSelectWorkspace(folderWorkspaces[0].id)}
                    title={folder.name}
                    aria-label={folder.name}
                    className="relative flex h-7 w-8 items-center justify-center rounded-md text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <FolderIcon />
                    {folderRunning > 0 && (
                      <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bar bg-status" />
                    )}
                  </button>

                  {/* Workspaces — square initial badges */}
                  {folderWorkspaces.map((ws) => {
                    const active = ws.id === activeWorkspaceId
                    const n = counts[ws.id] ?? 0
                    return (
                      <button
                        key={ws.id}
                        onClick={() => onSelectWorkspace(ws.id)}
                        title={`${folder.name} / ${ws.name}${ws.branch ? ` · ${ws.branch}` : ''}`}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active
                            ? 'bg-accentBg text-accent ring-1 ring-inset ring-accentBorder'
                            : 'text-fgdim hover:bg-hover hover:text-fg'
                        }`}
                      >
                        {initial(ws.name)}
                        {n > 0 && (
                          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-bar bg-status" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </nav>
      </aside>
    )
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-edge bg-bar transition-[width] duration-200 ease-out">
      <div className="border-b border-edge px-2 py-2">
        <button
          onClick={onAddFolder}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="flex h-5 w-5 items-center justify-center text-base leading-none text-accent">
            +
          </span>
          {t('sidebar.openFolder')}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {folders.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs leading-5 text-fgmuted">
            {t('sidebar.noWorkspaces')}
          </p>
        ) : (
          <div className="space-y-3">
            {folders.map((folder) => {
              const folderWorkspaces = workspaces.filter((w) => w.folderPath === folder.path)
              const open = !collapsedFolders.has(folder.path)
              const folderRunning = folderWorkspaces.reduce((a, w) => a + (counts[w.id] ?? 0), 0)
              return (
                <div key={folder.path}>
                  {/* Folder header — click to collapse / expand */}
                  <div
                    onClick={() => toggleFolder(folder.path)}
                    title={folder.path}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-fgdim transition hover:bg-hover"
                  >
                    <span className="flex h-5 w-4 shrink-0 items-center justify-center text-fgmuted">
                      <Chevron open={open} />
                    </span>
                    <span className="text-fgmuted">
                      <FolderIcon />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-fgdim">
                      {folder.name}
                    </span>
                    {!open && folderRunning > 0 && (
                      <RunningBadge
                        count={folderRunning}
                        title={t('sidebar.runningTerminals')}
                      />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveFolder(folder.path)
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg focus:opacity-100 group-hover:opacity-100"
                      aria-label={t('sidebar.removeFolder')}
                      title={t('sidebar.removeFolder')}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Workspaces — indented under a tree guide line */}
                  {open && (
                    <ul className="ml-[13px] mt-0.5 space-y-0.5 border-l border-edge pl-2">
                      {folderWorkspaces.map((ws) => {
                        const active = ws.id === activeWorkspaceId
                        const n = counts[ws.id] ?? 0
                        return (
                          <li key={ws.id}>
                            <div
                              onClick={() => onSelectWorkspace(ws.id)}
                              className={`group relative flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition ${
                                active
                                  ? 'bg-accentBg text-fg'
                                  : 'text-fg2 hover:bg-hover'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  active ? 'bg-accent' : 'bg-fgmuted'
                                }`}
                              />
                              {active && (
                                <span className="absolute -left-[9px] top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
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

                              {n > 0 && editingId !== ws.id && (
                                <RunningBadge count={n} title={t('sidebar.runningTerminals')} />
                              )}

                              {ws.worktreePath && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void window.api.openPath(ws.worktreePath as string)
                                  }}
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg focus:opacity-100 group-hover:opacity-100"
                                  aria-label={t('worktree.revealInFinder')}
                                  title={t('worktree.revealInFinder')}
                                >
                                  <svg
                                    className="h-3.5 w-3.5"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M9 2.5h4.5V7" />
                                    <path d="M13.5 2.5 7 9" />
                                    <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
                                  </svg>
                                </button>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onRemoveWorkspace(ws.id)
                                }}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg focus:opacity-100 group-hover:opacity-100"
                                aria-label={t('sidebar.removeWorkspace')}
                                title={t('sidebar.removeWorkspace')}
                              >
                                ✕
                              </button>
                            </div>
                          </li>
                        )
                      })}

                      {/* Add workspace (plain) or a worktree-backed branch workspace */}
                      <li>
                        {worktreeFor === folder.path ? (
                          <WorktreeCreateForm
                            folderPath={folder.path}
                            onCancel={() => setWorktreeFor(null)}
                            onCreate={onAddWorktreeWorkspace}
                          />
                        ) : addingFor === folder.path ? (
                          <input
                            autoFocus
                            value={draft}
                            placeholder={t('sidebar.newWorkspacePlaceholder')}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitAdd}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitAdd()
                              else if (e.key === 'Escape') {
                                setAddingFor(null)
                                setDraft('')
                              }
                            }}
                            className="w-full rounded border border-edge bg-panel px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
                          />
                        ) : (
                          <div className="space-y-0.5">
                            <button
                              onClick={() => startAdd(folder.path)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fgmuted transition hover:bg-hover hover:text-fg"
                            >
                              <span className="text-sm leading-none text-accent">+</span>
                              {t('sidebar.addWorkspace')}
                            </button>
                            <button
                              onClick={() => {
                                setWorktreeFor(folder.path)
                                setAddingFor(null)
                                setEditingId(null)
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fgmuted transition hover:bg-hover hover:text-fg"
                            >
                              <span className="text-accent">
                                <BranchGlyph />
                              </span>
                              {t('sidebar.addWorktreeWorkspace')}
                            </button>
                          </div>
                        )}
                      </li>
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </nav>
    </aside>
  )
}
