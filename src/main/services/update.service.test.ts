import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  shutdownDaemon: vi.fn(async () => undefined),
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      mocks.listeners.set(event, listener)
    })
  }
}))

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '1.0.0'), isPackaged: true },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  net: { fetch: vi.fn() },
  shell: { openExternal: vi.fn(async () => undefined) }
}))

vi.mock('electron-updater', () => ({
  default: { autoUpdater: mocks.autoUpdater }
}))

vi.mock('./daemonClient', () => ({
  shutdownDaemon: mocks.shutdownDaemon
}))

const originalPlatform = process.platform

async function loadForPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  vi.resetModules()
  return import('./update.service')
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
  mocks.listeners.clear()
  mocks.autoUpdater.on.mockClear()
  mocks.shutdownDaemon.mockClear()
  vi.resetModules()
})

describe('update-time daemon lifecycle', () => {
  it.each<NodeJS.Platform>(['darwin', 'linux'])(
    'keeps terminal sessions alive and requires no quit interception on %s',
    async (platform) => {
      const { initAutoUpdater, isUpdatePending, releaseDaemonForUpdate } =
        await loadForPlatform(platform)

      initAutoUpdater()
      mocks.listeners.get('update-downloaded')?.()

      expect(isUpdatePending()).toBe(false)
      await releaseDaemonForUpdate()

      expect(mocks.shutdownDaemon).not.toHaveBeenCalled()
    }
  )

  it('shuts the daemon down exactly once on Windows', async () => {
    const { initAutoUpdater, isUpdatePending, releaseDaemonForUpdate } =
      await loadForPlatform('win32')

    initAutoUpdater()
    mocks.listeners.get('update-downloaded')?.()

    expect(isUpdatePending()).toBe(true)
    await releaseDaemonForUpdate()
    expect(isUpdatePending()).toBe(false)
    await releaseDaemonForUpdate()

    expect(mocks.shutdownDaemon).toHaveBeenCalledTimes(1)
  })
})
