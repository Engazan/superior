import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/types'

const electron = vi.hoisted(() => ({ handle: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: electron }))

import { handle } from './handle'

describe('IPC handle helper', () => {
  beforeEach(() => {
    electron.handle.mockClear()
  })

  it('forwards invoke arguments without exposing the Electron event', () => {
    let killedId: string | undefined
    handle(IPC.AGENT_KILL, (id: string): void => {
      killedId = id
    })

    expect(electron.handle).toHaveBeenCalledOnce()
    const [, registeredListener] = electron.handle.mock.calls[0]

    registeredListener({} as never, 'session-1')
    expect(killedId).toBe('session-1')
  })
})
