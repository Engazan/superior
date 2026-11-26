import { SessionStatus } from '../SessionStatus'
import { PresetIcon } from '../PresetIcon'
import { agentKind } from '../../terminalSpine'
import type { AgentSession } from '../../types'

interface Props {
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelect: (session: AgentSession) => void
  className: string
}

/**
 * Terminals of one worktree, nested one level below it: a guide line and a
 * short connector per row tie every terminal to its parent worktree.
 */
export function SessionList({ sessions, activeSessionId, onSelect, className }: Props): React.JSX.Element | null {
  if (sessions.length === 0) return null

  return (
    <ul className={`superior-sidebar-sessions space-y-0.5 ${className}`}>
      {sessions.map((session) => (
        <li key={session.id} className="superior-sidebar-session-item relative">
          <button
            type="button"
            aria-current={session.id === activeSessionId || undefined}
            onClick={() => onSelect(session)}
            className="superior-sidebar-session flex w-full items-center gap-2 rounded-md py-1 pl-1.5 pr-2 text-left hover:bg-hover aria-[current=true]:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <span
              aria-hidden
              data-provider={agentKind(session.label) ?? undefined}
              className="superior-session-icon grid size-5 shrink-0 place-items-center rounded-[5px] bg-panel"
            >
              <PresetIcon iconType={session.iconType} icon={session.icon} className="size-3.5 text-xs" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12.5px] font-medium leading-4 text-fg2">
                {[session.label, session.nickname].filter(Boolean).join(' · ')}
              </span>
              <SessionStatus session={session} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
