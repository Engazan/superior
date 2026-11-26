import { describe, expect, it } from 'vitest'
import { NEEDS_YOU_LIMIT, needsYouItems } from './needsYou'
import type { AgentSession } from './types'

function session(id: string, patch: Partial<AgentSession> = {}): AgentSession {
  return {
    id,
    label: id,
    command: id,
    workspaceId: 'ws',
    tabId: 'tab',
    status: 'running',
    createdAt: Number(id.replace(/\D/g, '')) || 0,
    ...patch
  } as AgentSession
}

describe('needsYouItems', () => {
  it('lists waiting agents and sessions with unread alerts only', () => {
    const sessions = [session('s1'), session('s2'), session('s3')]
    const items = needsYouItems(sessions, new Set(['s2']), new Map([['s1', 'waiting' as const]]))
    expect(items.map((i) => [i.session.id, i.reason])).toEqual([
      ['s2', 'alert'],
      ['s1', 'waiting']
    ])
  })

  it('marks an exited session with an alert as exited', () => {
    const items = needsYouItems([session('s1', { status: 'exited', exitCode: 1 })], new Set(['s1']), new Map())
    expect(items[0].reason).toBe('exited')
  })

  it('ignores a waiting state reported by a session that already exited', () => {
    const items = needsYouItems([session('s1', { status: 'exited' })], new Set(), new Map([['s1', 'waiting' as const]]))
    expect(items).toEqual([])
  })

  it('caps the queue length', () => {
    const sessions = Array.from({ length: NEEDS_YOU_LIMIT + 3 }, (_, i) => session(`s${i + 1}`))
    const attention = new Set(sessions.map((s) => s.id))
    expect(needsYouItems(sessions, attention, new Map())).toHaveLength(NEEDS_YOU_LIMIT)
  })
})
