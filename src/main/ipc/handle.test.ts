import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ handle: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: electron }))

import { handle } from './handle'

describe('IPC handle helper', () => {
  beforeEach(() => {
    electron.handle.mockClear()
  })

  it('forwards invoke arguments without exposing the Electron event', () => {
    handle('test:increment', (value: number) => value + 1)

    expect(electron.handle).toHaveBeenCalledOnce()
    const [, registeredListener] = electron.handle.mock.calls[0]

    expect(registeredListener({} as never, 41)).toBe(42)
  })
})
