import { TerminalView } from './TerminalView'
import type { AgentSession } from '../types'

interface Props {
  sessions: AgentSession[]
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
  activeSessionId,
  onSelect,
  onClose,
  onSessionUpdate
}: Props): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      {/* Tab strip */}
      <div className="flex items-stretch gap-px overflow-x-auto border-b border-edge bg-bar">
        {sessions.map((s) => {
          const active = s.id === activeSessionId
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group flex cursor-pointer items-center gap-2 border-r border-edge px-3 py-2 text-xs ${
                active ? 'bg-panel text-[#cdd6f4]' : 'text-[#9399b2] hover:bg-panel/60'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s.status]}`} />
              <span className="font-mono">{s.agent}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(s.id)
                }}
                className="text-[#6c7086] opacity-0 transition group-hover:opacity-100 hover:text-[#cdd6f4]"
                aria-label="Close session"
                title="Stop and close"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {/* Terminal stack */}
      <div className="relative min-h-0 flex-1">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#6c7086]">
            No agent running. Open a folder, then launch Claude or Codex.
          </div>
        ) : (
          sessions.map((s) => (
            <TerminalView
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              onExit={(id, exitCode) =>
                onSessionUpdate(id, {
                  status: exitCode === 0 ? 'exited' : 'error',
                  exitCode
                })
              }
            />
          ))
        )}
      </div>
    </div>
  )
}
