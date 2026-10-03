import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC } from '@shared/types'

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  notices: [] as Array<{
    show: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    events: Map<string, () => void>
  }>,
  enabled: true,
  supported: true,
  window: {
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => false),
    isMinimized: vi.fn(() => true),
    restore: vi.fn(), show: vi.fn(), focus: vi.fn(),
    webContents: { send: vi.fn() }
  }
}))

vi.mock('electron', () => ({
  app: { setBadgeCount: vi.fn() },
  ipcMain: { on: (event: string, fn: (...args: unknown[]) => void) => mocks.listeners.set(event, fn) },
  Notification: class {
    static isSupported(): boolean { return mocks.supported }
    events = new Map<string, () => void>()
    show = vi.fn()
    close = vi.fn(() => this.events.get('close')?.())
    on(event: string, fn: () => void): void { this.events.set(event, fn) }
    constructor() { mocks.notices.push(this) }
  }
}))
vi.mock('../services/settings.service', () => ({
  getSettings: () => ({ notifications: mocks.enabled })
}))

import { registerNotificationsIpc } from './notifications.ipc'

const payload = { sessionId: 'session', workspaceId: 'workspace', title: 'Needs attention', body: 'Check terminal' }
function send(value: unknown = payload, sender: unknown = mocks.window.webContents): void {
  mocks.listeners.get(IPC.NOTIFY_FINISHED)?.({ sender }, value)
}

beforeEach(() => {
  mocks.listeners.clear()
  mocks.notices.length = 0
  mocks.enabled = true
  mocks.supported = true
  vi.clearAllMocks()
  mocks.window.isFocused.mockReturnValue(false)
  mocks.window.isDestroyed.mockReturnValue(false)
  registerNotificationsIpc(() => mocks.window as unknown as BrowserWindow)
})

describe('native terminal notifications', () => {
  it('checks native window focus again when a queued message arrives', () => {
    mocks.window.isFocused.mockReturnValue(true)
    send()
    expect(mocks.notices).toHaveLength(0)
  })

  it('checks notification settings again at delivery time', () => {
    mocks.enabled = false
    send()
    expect(mocks.notices).toHaveLength(0)
  })

  it('ignores foreign senders, destroyed windows and malformed requests', () => {
    send(payload, {})
    send({ ...payload, sessionId: null })
    send({ ...payload, sessionId: '' })
    send(null)
    mocks.window.isDestroyed.mockReturnValue(true)
    send()
    expect(mocks.notices).toHaveLength(0)
  })

  it('does not create notifications on unsupported systems', () => {
    mocks.supported = false
    send()
    expect(mocks.notices).toHaveLength(0)
  })

  it('replaces an older notification for the same session instead of stacking Windows toasts', () => {
    send()
    send()
    expect(mocks.notices).toHaveLength(2)
    expect(mocks.notices[0].close).toHaveBeenCalledOnce()
    expect(mocks.notices[1].show).toHaveBeenCalledOnce()
    send({ ...payload, sessionId: 'other' })
    expect(mocks.notices[1].close).not.toHaveBeenCalled()
  })

  it('restores the minimized window and selects the workspace when clicked', () => {
    send()
    mocks.notices[0].events.get('click')?.()
    expect(mocks.window.restore).toHaveBeenCalledOnce()
    expect(mocks.window.show).toHaveBeenCalledOnce()
    expect(mocks.window.focus).toHaveBeenCalledOnce()
    expect(mocks.window.webContents.send).toHaveBeenCalledWith(IPC.NOTIFY_ACTIVATED, 'workspace')
  })
})
