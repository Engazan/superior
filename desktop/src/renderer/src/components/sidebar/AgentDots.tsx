import { useAgentSessionStates, useAttentionSessions, useBusySessions } from '../../activityStore'
import { useI18n } from '../../i18n'
import { agentKind, terminalSpine } from '../../terminalSpine'
import type { AgentSession } from '../../types'

/** Most dots one worktree row shows before it folds the rest into "+n". */
const MAX_DOTS = 4

/**
 * One dot per terminal of a worktree, in the same colors as the terminal
 * status spine, so every worktree row shows what runs in it and what waits.
 */
export function AgentDots({ sessions }: { sessions: AgentSession[] }): React.JSX.Element | null {
  const { t } = useI18n()
  const states = useAgentSessionStates()
  const attention = useAttentionSessions()
  const busy = useBusySessions()
  if (sessions.length === 0) return null
  const shown = sessions.slice(0, MAX_DOTS)
  const extra = sessions.length - shown.length
  return (
    <span role="img" aria-label={`${t('sidebar.runningTerminals')}: ${sessions.length}`} className="flex shrink-0 items-center gap-1">
      {shown.map((session) => {
        const state = states.get(session.id)
        const spine = terminalSpine({
          attention: attention.has(session.id) || state === 'waiting',
          working: state === 'working' || (state === undefined && busy.has(session.id)),
          status: session.status,
          exitCode: session.exitCode
        })
        return (
          <span
            key={session.id}
            title={session.label}
            data-spine={spine ?? 'idle'}
            data-agent={agentKind(session.label) ?? 'shell'}
            className="superior-agent-dot h-1.5 w-1.5 rounded-full"
          />
        )
      })}
      {extra > 0 && <span className="font-mono text-[10px] text-fgmuted">+{extra}</span>}
    </span>
  )
}
