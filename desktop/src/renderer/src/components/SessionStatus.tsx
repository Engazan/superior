import { useAgentSessionState, useAttentionSessions, useBusySessions } from '../activityStore'
import { useAttentionColor } from '../attentionColor'
import { useI18n } from '../i18n'
import type { AgentSession } from '../types'

export function SessionStatus({ session }: { session: AgentSession }): React.JSX.Element {
  const { t } = useI18n()
  const state = useAgentSessionState(session.id)
  const needsAttention = useAttentionSessions().has(session.id)
  const busy = useBusySessions().has(session.id)
  const { attentionColor } = useAttentionColor()
  const [label, color] = session.status === 'error' ? [t('terminal.statusError'), 'text-danger']
    : session.status === 'exited' ? [t('terminal.activityExited'), 'text-fgmuted']
    : state === 'waiting' ? [t('terminal.activityWaiting'), 'text-warn']
    : needsAttention ? [t('terminal.statusFinished'), 'text-warn']
    : state === 'working' || busy ? [t('terminal.activityWorking'), 'text-status']
    : [t('terminal.activityReady'), 'text-fgmuted']

  return (
    <span className={`flex min-w-0 items-center gap-1.5 text-[11px] font-medium leading-[14px] ${color}`}>
      <span aria-hidden className="superior-session-status-dot size-2 shrink-0 rounded-full bg-current"
        style={needsAttention && state !== 'waiting' && session.status === 'running' ? { backgroundColor: attentionColor } : undefined} />
      <span className="truncate">{label}</span>
    </span>
  )
}
