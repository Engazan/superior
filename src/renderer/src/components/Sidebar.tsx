import { useState } from 'react'
import { useI18n } from '../i18n'
import type { Folder, Workspace } from '../types'

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
  onRenameWorkspace: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => void
  onSelectWorkspace: (id: string) => void
  onOpenSettings: () => void
}

function initial(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase()
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
  onRenameWorkspace,
  onRemoveWorkspace,
  onSelectWorkspace,
  onOpenSettings
}: Props): JSX.Element {
  const { t } = useI18n()
  // Inline editors: which workspace is being renamed, which folder is adding a workspace.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

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
      <aside className="flex w-16 shrink-0 flex-col items-stretch overflow-hidden border-r border-edge bg-bar">
        <div className="flex flex-col items-center gap-1 border-b border-edge p-2">
          <button
            onClick={onAddFolder}
            title={t('sidebar.openFolder')}
            aria-label={t('sidebar.openFolder')}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-edge text-lg leading-none text-fg transition hover:bg-hover"
          >
            +
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="flex flex-col items-center gap-1.5">
            {workspaces.map((ws) => {
              const active = ws.id === activeWorkspaceId
              const n = counts[ws.id] ?? 0
              return (
                <button
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  title={ws.name}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold transition ${
                    active ? 'bg-sky-600 text-white' : 'bg-edge text-fg2 hover:bg-hover'
                  }`}
                >
                  {initial(ws.name)}
                  {n > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-bar" />
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        <div className="flex justify-center border-t border-edge p-2">
          <button
            onClick={onOpenSettings}
            title={t('sidebar.settings')}
            aria-label={t('sidebar.settings')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-fgdim transition hover:bg-hover hover:text-fg"
          >
            <span className="text-base leading-none">⚙</span>
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-bar">
      <div className="border-b border-edge p-2">
        <button
          onClick={onAddFolder}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-edge px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-hover"
        >
          <span className="text-base leading-none">+</span> {t('sidebar.openFolder')}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {folders.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fgmuted">{t('sidebar.noWorkspaces')}</p>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) => {
              const folderWorkspaces = workspaces.filter((w) => w.folderPath === folder.path)
              return (
                <div key={folder.path}>
                  {/* Folder header */}
                  <div className="group flex items-center gap-1 px-2 py-1" title={folder.path}>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-fgdim">
                      {folder.name}
                    </span>
                    <button
                      onClick={() => onRemoveFolder(folder.path)}
                      className="shrink-0 text-fgmuted opacity-0 transition hover:text-fg group-hover:opacity-100"
                      aria-label={t('sidebar.removeFolder')}
                      title={t('sidebar.removeFolder')}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Workspaces */}
                  <ul className="space-y-0.5">
                    {folderWorkspaces.map((ws) => {
                      const active = ws.id === activeWorkspaceId
                      const n = counts[ws.id] ?? 0
                      return (
                        <li key={ws.id}>
                          <div
                            onClick={() => onSelectWorkspace(ws.id)}
                            className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                              active ? 'bg-panel' : 'hover:bg-panel/60'
                            }`}
                          >
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
                                className="min-w-0 flex-1 rounded border border-edge bg-panel px-1.5 py-0.5 text-sm text-fg focus:border-fgdim focus:outline-none"
                              />
                            ) : (
                              <span
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  startRename(ws)
                                }}
                                className={`min-w-0 flex-1 truncate text-sm font-medium ${
                                  active ? 'text-fg' : 'text-fg2'
                                }`}
                                title={t('sidebar.renameWorkspace')}
                              >
                                {ws.name}
                              </span>
                            )}

                            {n > 0 && editingId !== ws.id && (
                              <span
                                className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-semibold text-emerald-300"
                                title={t('sidebar.runningTerminals')}
                              >
                                {n}
                              </span>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onRemoveWorkspace(ws.id)
                              }}
                              className="shrink-0 text-fgmuted opacity-0 transition hover:text-fg group-hover:opacity-100"
                              aria-label={t('sidebar.removeWorkspace')}
                              title={t('sidebar.removeWorkspace')}
                            >
                              ✕
                            </button>
                          </div>
                        </li>
                      )
                    })}

                    {/* Add workspace */}
                    <li>
                      {addingFor === folder.path ? (
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
                          className="w-full rounded border border-edge bg-panel px-2 py-1 text-sm text-fg focus:border-fgdim focus:outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => startAdd(folder.path)}
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fgmuted transition hover:bg-panel/60 hover:text-fg"
                        >
                          <span className="text-sm leading-none">+</span> {t('sidebar.addWorkspace')}
                        </button>
                      )}
                    </li>
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </nav>

      {/* Settings — pinned to the bottom */}
      <div className="border-t border-edge p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg"
        >
          <span className="text-base leading-none">⚙</span> {t('sidebar.settings')}
        </button>
      </div>
    </aside>
  )
}
