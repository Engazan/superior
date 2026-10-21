import type { CSSProperties, ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { useShortcutTitle } from '../../shortcuts'
import { GearIcon, PhoneIcon, PlusIcon } from '../ui'
import { FolderGlyph, WorkingSpinner, folderLabel, folderTitle, initial } from './parts'
import { SidebarUpdate } from './SidebarUpdate'
import type { UpdateController } from '../../hooks/useUpdateCheck'
import type { Folder, Workspace } from '../../types'

type MenuAnchor = HTMLElement | { x: number; y: number }

interface Props {
  folders: Folder[]
  /** a project's workspaces in display order */
  projectWorkspaces: (folderPath: string) => Workspace[]
  activeWorkspaceId: string | null
  busyWorkspaceIds: Set<string>
  attentionWorkspaceIds: Set<string>
  attentionColor: string
  update: UpdateController
  /** menus + dialogs shared with the expanded sidebar */
  overlays: ReactNode
  onSelectWorkspace: (id: string) => void
  onExpand: () => void
  onOpenProject: () => void
  onOpenSettings: () => void
  onOpenMobileAccess: () => void
  onFolderMenu: (path: string, anchor: MenuAnchor) => void
  onWorkspaceMenu: (id: string, anchor: MenuAnchor) => void
}

/** One square rail button shape: every rail control shares size, radius and focus ring. */
const RAIL_BTN =
  'relative flex h-8 w-8 items-center justify-center rounded-md transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50'

/** Collapsed sidebar: workspace initials with the same activity and selection cues. */
export function SidebarRail({
  folders,
  projectWorkspaces,
  activeWorkspaceId,
  busyWorkspaceIds,
  attentionWorkspaceIds,
  attentionColor,
  update,
  overlays,
  onSelectWorkspace,
  onExpand,
  onOpenProject,
  onOpenSettings,
  onOpenMobileAccess,
  onFolderMenu,
  onWorkspaceMenu
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const shortcutTitle = useShortcutTitle()
  // Keyboard equivalent of right-click, matching the expanded rows.
  const menuKey = (e: React.KeyboardEvent<HTMLButtonElement>, open: (anchor: HTMLElement) => void): void => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault()
      open(e.currentTarget)
    }
  }
  return (
    <aside className="superior-sidebar flex w-14 shrink-0 select-none flex-col items-stretch overflow-hidden bg-bar transition-[width] duration-200 ease-out">
      {overlays}
      <div className="flex flex-col items-center gap-1 border-b border-edge p-2">
        <button
          type="button"
          onClick={onOpenMobileAccess}
          title={t('sidebar.mobileAccess')}
          aria-label={t('sidebar.mobileAccess')}
          className={`${RAIL_BTN} text-fgdim hover:bg-hover hover:text-fg`}
        >
          <PhoneIcon size={18} />
        </button>
        <button
          type="button"
          onClick={onOpenProject}
          title={t('sidebar.openProject')}
          aria-label={t('sidebar.openProject')}
          className={`${RAIL_BTN} text-fgdim hover:bg-hover hover:text-fg`}
        >
          <PlusIcon size={16} />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-2">
        <div className="flex flex-col items-center gap-2">
          {folders.map((folder, i) => {
            const folderWorkspaces = projectWorkspaces(folder.path)
            const folderBusy = folderWorkspaces.some((w) => busyWorkspaceIds.has(w.id))
            const folderAttn = folderWorkspaces.some((w) => attentionWorkspaceIds.has(w.id))
            return (
              <div key={folder.path} className="flex w-full flex-col items-center gap-1.5">
                {i > 0 && <div className="my-1 h-px w-6 bg-edge" />}

                {/* Project marker — folder glyph; jumps to its first workspace.
                    With no workspaces it expands the sidebar instead of no-oping. */}
                <button
                  type="button"
                  onClick={() => {
                    if (folderWorkspaces[0]) onSelectWorkspace(folderWorkspaces[0].id)
                    else onExpand()
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onFolderMenu(folder.path, { x: e.clientX, y: e.clientY })
                  }}
                  onKeyDown={(e) => menuKey(e, (anchor) => onFolderMenu(folder.path, anchor))}
                  title={folderTitle(folder)}
                  aria-label={folderLabel(folder)}
                  aria-haspopup="menu"
                  style={folder.color ? { color: folder.color } : undefined}
                  className={`${RAIL_BTN} text-fgmuted hover:bg-hover hover:text-fg`}
                >
                  <FolderGlyph folder={folder} />
                  {folderAttn ? (
                    <span
                      style={{ '--attn': attentionColor } as CSSProperties}
                      className="attention-pulse-dot absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bar"
                    />
                  ) : folderBusy ? (
                    <WorkingSpinner className="absolute -right-0.5 -top-0.5 h-3 w-3" />
                  ) : null}
                </button>

                {/* Workspaces — square initial badges */}
                {folderWorkspaces.map((ws) => {
                  const active = ws.id === activeWorkspaceId
                  const busy = busyWorkspaceIds.has(ws.id)
                  const attn = attentionWorkspaceIds.has(ws.id)
                  const label = `${folderLabel(folder)} / ${ws.name}${ws.branch ? ` · ${ws.branch}` : ''}`
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => onSelectWorkspace(ws.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        onWorkspaceMenu(ws.id, { x: e.clientX, y: e.clientY })
                      }}
                      onKeyDown={(e) => menuKey(e, (anchor) => onWorkspaceMenu(ws.id, anchor))}
                      aria-current={active || undefined}
                      aria-label={label}
                      title={label}
                      style={attn ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
                      className={`${RAIL_BTN} text-xs font-semibold ${
                        active
                          ? 'bg-accentBg text-accent ring-1 ring-inset ring-accentBorder'
                          : 'text-fgdim hover:bg-hover hover:text-fg'
                      }`}
                    >
                      {initial(ws.name)}
                      {active && <span aria-hidden className="absolute inset-y-2 -left-2 w-0.5 rounded-full bg-accent" />}
                      {attn ? (
                        <span
                          style={{ '--attn': attentionColor } as CSSProperties}
                          className="attention-pulse-dot absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-bar"
                        />
                      ) : busy ? (
                        <WorkingSpinner className="absolute -right-1 -top-1 h-3.5 w-3.5" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </nav>
      <SidebarUpdate update={update} collapsed />
      <div className="shrink-0 border-t border-edge p-2">
        <button
          type="button"
          onClick={onOpenSettings}
          title={shortcutTitle(t('sidebar.settings'), 'openSettings')}
          aria-label={t('sidebar.settings')}
          className={`${RAIL_BTN} mx-auto text-fgdim hover:bg-hover hover:text-fg`}
        >
          <GearIcon size={18} />
        </button>
      </div>
    </aside>
  )
}
