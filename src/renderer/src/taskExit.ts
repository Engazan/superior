import type { AgentTaskStatus } from './types'

export interface TaskExitOutcome {
  status: Extract<AgentTaskStatus, 'done' | 'failed'>
  error?: 'terminal-interrupted'
}

/** A missing process result is a failure, never evidence of successful work. */
export function taskExitOutcome(exitCode: number | null): TaskExitOutcome {
  if (exitCode === 0) return { status: 'done' }
  return exitCode === null
    ? { status: 'failed', error: 'terminal-interrupted' }
    : { status: 'failed' }
}
