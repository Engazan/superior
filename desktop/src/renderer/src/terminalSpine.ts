import type { AgentSession } from './types'

/** Status stripe on a terminal's left edge; null draws none. */
export type TerminalSpine = 'attention' | 'working' | 'error' | 'exited' | null

interface SpineInput {
  /** An unread terminal alert, or the agent waits for permission/input. */
  attention: boolean
  /** The agent reports a turn in progress, or output is still arriving. */
  working: boolean
  status: AgentSession['status']
  exitCode?: number | null
}

/**
 * Attention wins over everything, because it means the user must act.
 * A finished process shows whether it failed; a live idle shell shows nothing.
 */
export function terminalSpine({ attention, working, status, exitCode }: SpineInput): TerminalSpine {
  if (attention) return 'attention'
  if (status === 'error') return 'error'
  if (status !== 'running') return exitCode ? 'error' : 'exited'
  if (working) return 'working'
  return null
}

/** Which agent CLI a terminal runs, from its label; null for a plain shell or tool. */
export function agentKind(label: string): 'claude' | 'codex' | null {
  if (/^claude(?:\s|$)/i.test(label)) return 'claude'
  if (/^codex(?:\s|$)/i.test(label)) return 'codex'
  return null
}
