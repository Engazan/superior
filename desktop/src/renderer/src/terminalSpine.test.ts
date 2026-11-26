import { describe, expect, it } from 'vitest'
import { agentKind, terminalSpine } from './terminalSpine'

describe('terminalSpine', () => {
  it('prefers attention over every other state', () => {
    expect(terminalSpine({ attention: true, working: true, status: 'running' })).toBe('attention')
    expect(terminalSpine({ attention: true, working: false, status: 'exited', exitCode: 1 })).toBe('attention')
  })

  it('shows working only for a running session', () => {
    expect(terminalSpine({ attention: false, working: true, status: 'running' })).toBe('working')
    expect(terminalSpine({ attention: false, working: false, status: 'running' })).toBeNull()
  })

  it('separates failed exits from clean ones', () => {
    expect(terminalSpine({ attention: false, working: false, status: 'exited', exitCode: 2 })).toBe('error')
    expect(terminalSpine({ attention: false, working: false, status: 'exited', exitCode: 0 })).toBe('exited')
    expect(terminalSpine({ attention: false, working: false, status: 'error' })).toBe('error')
  })
})

describe('agentKind', () => {
  it('recognizes Claude and Codex labels', () => {
    expect(agentKind('Claude')).toBe('claude')
    expect(agentKind('codex --full-auto')).toBe('codex')
    expect(agentKind('npm run dev')).toBeNull()
    expect(agentKind('claudette')).toBeNull()
  })
})
