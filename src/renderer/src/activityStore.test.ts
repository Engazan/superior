import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentDataEvent, AgentExitEvent, AgentSession } from './types'

// Exercise the actual singleton store and subscriptions without mounting React.
vi.mock('react', () => ({
  useSyncExternalStore: (subscribe: (fn: () => void) => () => void, snapshot: () => unknown) => {
    subscribe(() => {})
    return snapshot()
  }
}))

let store: typeof import('./activityStore')
let onData: (event: AgentDataEvent) => void
let onExit: (event: AgentExitEvent) => void
let onFocus: () => void
let focused: boolean
const notifier = vi.fn()
const sessions = [
  { id: 'a', workspaceId: 'w', status: 'running' },
  { id: 'b', workspaceId: 'w', status: 'running' }
] as AgentSession[]

function output(data: string, id = 'a', replay = false): void {
  onData({ id, data, replay })
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  notifier.mockClear()
  focused = false
  vi.stubGlobal('document', { hasFocus: () => focused })
  vi.stubGlobal('window', {
    addEventListener: (_event: string, fn: () => void) => { onFocus = fn },
    api: {
      onAgentData: (fn: typeof onData) => { onData = fn },
      onAgentExit: (fn: typeof onExit) => { onExit = fn }
    }
  })
  store = await import('./activityStore')
  store.setActivitySessions(sessions)
  store.setActivityNotifier(notifier)
  store.useBusySessions()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('terminal activity is not task completion', () => {
  it('never announces completion for periodic Windows redraws, startup prompts or long pauses', () => {
    for (const data of ['PS C:\\project> ', '\x1b[2K\r', '\x1b]9;4;1;50\x07']) {
      output(data)
      expect(store.useBusySessions().has('a')).toBe(true)
      vi.advanceTimersByTime(60_000)
      expect(store.useBusySessions().size).toBe(0)
    }
    expect(notifier).not.toHaveBeenCalled()
    expect(store.useAttentionSessions().size).toBe(0)
    expect(store.useAttentionWorkspaces().size).toBe(0)
  })

  it('does not replay old notifications, even when the replay ends in a partial OSC', () => {
    output('\x07\x1b]9;old\x07\x1b]9;', 'a', true)
    output('ordinary output\x1b]0;title\x07')
    vi.runAllTimers()
    expect(notifier).not.toHaveBeenCalled()
  })

  it('coalesces repeated alerts and redraws until another user interaction', () => {
    output('\x1b]9;Needs attention\x07')
    output('redraw')
    vi.advanceTimersByTime(10_000)
    output('\x07\x07')
    expect(notifier).toHaveBeenCalledTimes(1)
    expect(store.useAttentionSessions().has('a')).toBe(true)
    store.noteActivityInput('a')
    expect(store.useAttentionSessions().has('a')).toBe(false)
    output('\x07')
    expect(notifier).toHaveBeenCalledTimes(2)
  })

  it('delivers explicit alerts only after their complete sequence arrives', () => {
    output('\x1b]777;notify;Claude;')
    vi.advanceTimersByTime(20_000)
    expect(notifier).not.toHaveBeenCalled()
    output('Permission needed\x1b')
    expect(notifier).not.toHaveBeenCalled()
    output('\\')
    expect(notifier).toHaveBeenCalledTimes(1)
  })

  it('notifies exactly once for a silent process exit, even if its session state updated first', () => {
    store.setActivitySessions([{ ...sessions[0], status: 'exited' }])
    onExit({ id: 'a', exitCode: 0 })
    onExit({ id: 'a', exitCode: 0 })
    output('late buffered output')
    vi.runAllTimers()
    expect(notifier).toHaveBeenCalledTimes(1)
    expect(store.useBusySessions().size).toBe(0)
  })

  it('does not announce a daemon disconnect as completion', () => {
    output('working')
    onExit({ id: 'a', exitCode: null, reason: 'interrupted' })
    vi.runAllTimers()
    expect(notifier).not.toHaveBeenCalled()
    expect(store.useBusySessions().size).toBe(0)
  })

  it('does not duplicate an explicit alert when the process then exits', () => {
    output('\x07')
    onExit({ id: 'a', exitCode: 1 })
    expect(notifier).toHaveBeenCalledTimes(1)
  })

  it('cleans up busy timers, alerts and parser state when a terminal closes', () => {
    output('working')
    output('\x07', 'b')
    const isCurrent = notifier.mock.calls[0][2] as () => boolean
    store.setActivitySessions([])
    expect(isCurrent()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    output('\x07')
    vi.runAllTimers()
    expect(store.useAttentionSessions().size).toBe(0)
    expect(store.useAttentionWorkspaces().size).toBe(0)
    expect(store.useBusySessions().size).toBe(0)
    expect(notifier).toHaveBeenCalledTimes(1)
  })

  it('does not erase another terminal alert when a sibling starts producing output', () => {
    output('\x07')
    output('working', 'b')
    expect(store.useAttentionWorkspaces().has('w')).toBe(true)
    store.noteActivityInput('b')
    expect(store.useAttentionWorkspaces().has('w')).toBe(true)
  })

  it('invalidates pending delivery on new input', () => {
    output('\x07')
    const isCurrent = notifier.mock.calls[0][2] as () => boolean
    expect(isCurrent()).toBe(true)
    store.noteActivityInput('a')
    expect(isCurrent()).toBe(false)
    output('\x07')
    expect(isCurrent()).toBe(false)
  })

  it('acknowledges the visible cell on window focus and cancels pending notifications', () => {
    store.setActivityActiveSession('a')
    output('\x07')
    output('\x07', 'b')
    const checks = notifier.mock.calls.map((call) => call[2] as () => boolean)
    focused = true
    onFocus()
    expect(checks.every((check) => !check())).toBe(true)
    expect([...store.useAttentionSessions()]).toEqual(['b'])
    focused = false
    output('\x07')
    expect(notifier).toHaveBeenCalledTimes(2)
  })

  it('does not notify while focused but flags an unwatched cell', () => {
    focused = true
    store.setActivityActiveSession('a')
    output('\x07')
    output('\x07', 'b')
    expect(notifier).not.toHaveBeenCalled()
    expect([...store.useAttentionSessions()]).toEqual(['b'])
    store.setActivityActiveSession('b')
    expect(store.useAttentionSessions().size).toBe(0)
  })
})
