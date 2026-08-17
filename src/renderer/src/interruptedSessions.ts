import type { AgentSession } from './types'

/** Sessions that were persisted as running but disappeared with the terminal daemon. */
export function interruptedSessions(sessions: readonly AgentSession[]): AgentSession[] {
  return sessions.filter((session) => session.status !== 'running' && session.exitCode === null)
}
