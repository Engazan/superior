import { SessionStatus } from '../SessionStatus'
import type { AgentSession } from '../../types'

interface Props {
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelect: (session: AgentSession) => void
  className: string
}

export function SessionList({ sessions, activeSessionId, onSelect, className }: Props): React.JSX.Element | null {
  if (sessions.length === 0) return null

  return (
    <ul className={`superior-sidebar-sessions space-y-0.5 ${className}`}>
      {sessions.map((session) => (
        <li key={session.id}>
          <button
            type="button"
            aria-current={session.id === activeSessionId || undefined}
            onClick={() => onSelect(session)}
            className="superior-sidebar-session relative block w-full rounded-lg py-[7px] pl-[26px] pr-2 text-left hover:bg-hover aria-[current=true]:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <span className="block truncate text-[13px] font-medium leading-4">
              {[session.label, session.nickname].filter(Boolean).join(' · ')}
            </span>
            <SessionStatus session={session} />
          </button>
        </li>
      ))}
    </ul>
  )
}
