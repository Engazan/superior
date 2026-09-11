import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_IPC } from '@shared/browser'
import type { BrowserWindow } from 'electron'
const mocks = vi.hoisted(() => ({ handle: vi.fn(), on: vi.fn(), request: vi.fn(), send: vi.fn(), pick: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle, on: mocks.on } }))
vi.mock('../services/browser.service', () => ({ BrowserService: class { request = mocks.request; send = mocks.send; pick = mocks.pick } }))
import { registerBrowserIpc } from './browser.ipc'

beforeEach(() => vi.clearAllMocks())
describe('browser IPC ownership', () => {
  it('only lets the app main frame control browser views and send design requests', async () => {
    const frame = {}
    const contents = { mainFrame: frame }
    const owner = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow
    registerBrowserIpc(() => owner)
    for (const channel of [BROWSER_IPC.REQUEST, BROWSER_IPC.SEND]) {
      const handler = mocks.handle.mock.calls.find(([name]) => name === channel)![1]
      await expect(handler({ sender: {}, senderFrame: frame }, {})).rejects.toThrow('only available to the app')
      await expect(handler({ sender: contents, senderFrame: {} }, {})).rejects.toThrow('only available to the app')
      await handler({ sender: contents, senderFrame: frame }, { workspaceId: 'a' })
    }
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(owner, { workspaceId: 'a' })
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(owner, { workspaceId: 'a' })
  })
})
