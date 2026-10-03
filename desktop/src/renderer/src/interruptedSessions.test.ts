import { describe, expect, it } from 'vitest'
import type { AgentSession } from './types'
import { interruptedSessions } from './interruptedSessions'

function session(id: string, patch: Partial<AgentSession> = {}): AgentSession {
  return {
    id,
    label: 'Terminal',
    command: '',
    workspaceId: 'workspace-1',
    tabId: 'tab-1',
    status: 'running',
    createdAt: 1,
    ...patch
  }
}

describe('interruptedSessions', () => {
  it('selects only sessions lost with the daemon', () => {
    const sessions = [
      session('running'),
      session('clean-exit', { status: 'exited', exitCode: 0 }),
      session('failed', { status: 'error', exitCode: 1 }),
      session('interrupted-exit', { status: 'exited', exitCode: null }),
      session('interrupted-error', { status: 'error', exitCode: null })
    ]

    expect(interruptedSessions(sessions).map(({ id }) => id)).toEqual([
      'interrupted-exit',
      'interrupted-error'
    ])
  })
})
