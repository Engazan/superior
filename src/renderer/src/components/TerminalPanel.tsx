import { TerminalView } from './TerminalView'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import type { AgentSession } from '../types'

interface Props {
  /** All sessions across every workspace — kept mounted so buffers survive workspace switches. */
  sessions: AgentSession[]
  activePath: string | null
  activeSessionId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onSessionUpdate: (id: string, patch: Partial<AgentSession>) => void
}

const STATUS_DOT: Record<AgentSession['status'], string> = {
  running: 'bg-emerald-400',
  exited: 'bg-zinc-500',
  error: 'bg-red-500'
}

export function TerminalPanel({
  sessions,
  activePath,
  activeSessionId,
  onSelect,
  onClose,
  onSessionUpdate
}: Props): JSX.Element {
  const { t } = useI18n()
  // Tabs are scoped to the active workspace; the terminal stack mounts everything.
  const tabs = sessions.filter((s) => s.workspacePath === activePath)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      {/* Tab strip */}
      <div className="flex items-stretch gap-px overflow-x-auto border-b border-edge bg-bar">
        {tabs.map((s) => {
          const active = s.id === activeSessionId
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group flex cursor-pointer items-center gap-2 border-r border-edge px-3 py-2 text-xs ${
                active ? 'bg-panel text-fg' : 'text-fgdim hover:bg-panel/60'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s.status]}`} />
              <PresetIcon iconType={s.iconType} icon={s.icon} className="h-3.5 w-3.5 text-sm" />
              <span>{s.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(s.id)
                }}
                className="text-fgmuted opacity-0 transition group-hover:opacity-100 hover:text-fg"
                aria-label={t('terminal.closeSession')}
                title={t('terminal.stopClose')}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* Terminal stack — every session stays mounted; only the active one is visible. */}
      <div className="relative min-h-0 flex-1">
        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fgmuted">
            {t('terminal.empty')}
          </div>
        )}
        {sessions.map((s) => (
          <TerminalView
            key={s.id}
            session={s}
            active={s.workspacePath === activePath && s.id === activeSessionId}
            onExit={(id, exitCode) =>
              onSessionUpdate(id, {
                status: exitCode === 0 ? 'exited' : 'error',
                exitCode
              })
            }
          />
        ))}
      </div>
    </div>
  )
}
