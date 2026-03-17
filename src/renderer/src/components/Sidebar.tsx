import { DragStrip } from './DragStrip'
import { useI18n } from '../i18n'
import type { Workspace } from '../types'

interface Props {
  workspaces: Workspace[]
  activePath: string | null
  onAdd: () => void
  onSelect: (path: string) => void
  onRemove: (path: string) => void
  onOpenSettings: () => void
  onToggle: () => void
}

export function Sidebar({
  workspaces,
  activePath,
  onAdd,
  onSelect,
  onRemove,
  onOpenSettings,
  onToggle
}: Props): JSX.Element {
  const { t } = useI18n()
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-bar">
      <DragStrip onToggleSidebar={onToggle} />
      <div className="border-b border-edge p-2">
        <button
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-edge px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-hover"
        >
          <span className="text-base leading-none">+</span> {t('sidebar.openFolder')}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {workspaces.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fgmuted">{t('sidebar.noWorkspaces')}</p>
        ) : (
          <ul className="space-y-0.5">
            {workspaces.map((ws) => {
              const active = ws.path === activePath
              return (
                <li key={ws.path}>
                  <div
                    onClick={() => onSelect(ws.path)}
                    title={ws.path}
                    className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                      active ? 'bg-panel' : 'hover:bg-panel/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-sm font-medium ${
                          active ? 'text-fg' : 'text-fg2'
                        }`}
                      >
                        {ws.name}
                      </div>
                      <div className="truncate font-mono text-[10px] text-fgmuted">{ws.path}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(ws.path)
                      }}
                      className="shrink-0 text-fgmuted opacity-0 transition hover:text-fg group-hover:opacity-100"
                      aria-label={`${t('common.delete')} ${ws.name}`}
                      title={t('sidebar.removeFromList')}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
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
