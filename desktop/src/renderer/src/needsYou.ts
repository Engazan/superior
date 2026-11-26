import type { AgentState } from '@shared/agent-state'
import type { AgentSession } from './types'

export type NeedsYouReason = 'waiting' | 'exited' | 'alert'

export interface NeedsYouItem {
  session: AgentSession
  reason: NeedsYouReason
}

/** Upper bound so a burst of alerts cannot push the workspace list off screen. */
export const NEEDS_YOU_LIMIT = 4

/**
 * Sessions that wait for the user, newest first. An agent that reports it is
 * waiting counts even before its alert arrives; other sessions count only while
 * they hold an unread alert (a terminal bell or a process exit).
 */
export function needsYouItems(
  sessions: AgentSession[],
  attention: ReadonlySet<string>,
  agentStates: ReadonlyMap<string, AgentState>
): NeedsYouItem[] {
  const items: NeedsYouItem[] = []
  for (const session of sessions) {
    const waiting = session.status === 'running' && agentStates.get(session.id) === 'waiting'
    if (!waiting && !attention.has(session.id)) continue
    const reason: NeedsYouReason = waiting ? 'waiting' : session.status !== 'running' ? 'exited' : 'alert'
    items.push({ session, reason })
  }
  items.sort((a, b) => b.session.createdAt - a.session.createdAt)
  return items.slice(0, NEEDS_YOU_LIMIT)
}
