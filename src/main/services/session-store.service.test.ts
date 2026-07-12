import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSession } from '@shared/types'

const electron = vi.hoisted(() => ({ getPath: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: electron.getPath } }))

import {
  listPersistedSessions,
  reconcilePersistedSessions,
  upsertPersistedSession
} from './session-store.service'

function session(overrides: Partial<AgentSession> & { id: string }): AgentSession {
  return {
    label: 'Claude',
    command: 'claude',
    workspaceId: 'ws-1',
    tabId: 'tab-1',
    status: 'running',
    createdAt: 1,
    ...overrides
  }
}

describe('reconcilePersistedSessions', () => {
  let userData: string

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-session-store-'))
    electron.getPath.mockReturnValue(userData)
  })

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true })
    electron.getPath.mockReset()
  })

  it('keeps a persisted session that is still live in the daemon', () => {
    upsertPersistedSession(session({ id: 'a', pid: 100 }))
    const live = [session({ id: 'a', pid: 100 })]

    const result = reconcilePersistedSessions(live)

    expect(result).toEqual([expect.objectContaining({ id: 'a', status: 'running' })])
  })

  it('downgrades a running session the daemon no longer has to a restartable dead cell', () => {
    upsertPersistedSession(session({ id: 'a', pid: 100, status: 'running' }))

    const result = reconcilePersistedSessions([])

    expect(result).toEqual([
      expect.objectContaining({ id: 'a', status: 'exited', pid: undefined, exitCode: null })
    ])
  })

  it('drops an already-exited cell the daemon no longer owns instead of resurrecting it', () => {
    // The bug: an exited "dead cell" (e.g. a Claude that ended while the app was
    // quit) was restored on every launch and piled up next to freshly relaunched
    // terminals — 1 running Claude turning into 3 (2 exited) across restarts.
    upsertPersistedSession(session({ id: 'live', pid: 100, status: 'running' }))
    upsertPersistedSession(session({ id: 'dead-1', status: 'exited', exitCode: null }))
    upsertPersistedSession(session({ id: 'dead-2', status: 'error', exitCode: null }))

    const result = reconcilePersistedSessions([session({ id: 'live', pid: 100 })])

    expect(result.map((s) => s.id)).toEqual(['live'])
    // The store is rewritten without the stale dead cells.
    expect(listPersistedSessions().map((s) => s.id)).toEqual(['live'])
  })

  it('grants a lost running session exactly one run before it is pruned', () => {
    upsertPersistedSession(session({ id: 'a', pid: 100, status: 'running' }))

    // First launch after the process vanished: shown once as a restartable cell.
    const firstLaunch = reconcilePersistedSessions([])
    expect(firstLaunch.map((s) => s.id)).toEqual(['a'])
    expect(firstLaunch[0].status).toBe('exited')

    // Next launch, still gone from the daemon: the dead cell is dropped.
    const secondLaunch = reconcilePersistedSessions([])
    expect(secondLaunch).toEqual([])
  })

  it('adopts a live daemon session that was never persisted', () => {
    const result = reconcilePersistedSessions([session({ id: 'orphan', pid: 100 })])

    expect(result).toEqual([expect.objectContaining({ id: 'orphan', status: 'running' })])
  })
})
