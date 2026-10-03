import { describe, expect, it } from 'vitest'
import {
  clearMaximizedForTab,
  maximizedForTab,
  removeMaximizedSession,
  replaceMaximizedSession,
  toggleMaximizedForTab
} from './maximizedSessions'

describe('maximized terminal state', () => {
  it('keeps one independent maximized terminal per tab', () => {
    let state = toggleMaximizedForTab({}, 'workspace-a-tab', 'terminal-a')
    state = toggleMaximizedForTab(state, 'workspace-b-tab', 'terminal-b')

    expect(maximizedForTab(state, 'workspace-a-tab')).toBe('terminal-a')
    expect(maximizedForTab(state, 'workspace-b-tab')).toBe('terminal-b')
  })

  it('restores only the selected tab without clearing another tab', () => {
    const initial = {
      'workspace-a-tab': 'terminal-a',
      'workspace-b-tab': 'terminal-b'
    }

    const restored = toggleMaximizedForTab(initial, 'workspace-a-tab', 'terminal-a')

    expect(maximizedForTab(restored, 'workspace-a-tab')).toBeNull()
    expect(maximizedForTab(restored, 'workspace-b-tab')).toBe('terminal-b')
  })

  it('cleans up closed tabs and follows restarted sessions', () => {
    const initial = {
      'workspace-a-tab': 'terminal-a',
      'workspace-b-tab': 'terminal-b'
    }
    const restarted = replaceMaximizedSession(initial, 'terminal-a', 'terminal-a-next')
    const closedSession = removeMaximizedSession(restarted, 'terminal-b')
    const closedTab = clearMaximizedForTab(closedSession, 'workspace-a-tab')

    expect(restarted['workspace-a-tab']).toBe('terminal-a-next')
    expect(maximizedForTab(closedSession, 'workspace-b-tab')).toBeNull()
    expect(closedTab).toEqual({})
  })
})
