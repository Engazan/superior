import { EventEmitter } from 'events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(), relaunch: vi.fn(), quit: vi.fn(), hasSwitch: vi.fn(), appendFileSync: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/superior-test', commandLine: { hasSwitch: mocks.hasSwitch }, relaunch: mocks.relaunch, quit: mocks.quit },
  dialog: { showMessageBox: mocks.showMessageBox }
}))
vi.mock('fs', () => ({ appendFileSync: mocks.appendFileSync, existsSync: () => false, statSync: vi.fn(), writeFileSync: vi.fn() }))
import { attachWindowRecovery } from './window-recovery.service'

function windowMock(): EventEmitter & {
  webContents: EventEmitter; reload: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; isDestroyed: ReturnType<typeof vi.fn>
} {
  return Object.assign(new EventEmitter(), {
    id: 1, webContents: new EventEmitter(), reload: vi.fn(), close: vi.fn(), isDestroyed: vi.fn(() => false)
  })
}
function crash(win: ReturnType<typeof windowMock>, reason = 'crashed'): void {
  win.webContents.emit('render-process-gone', {}, { reason, exitCode: 1 })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.showMessageBox.mockResolvedValue({ response: 1 })
  mocks.hasSwitch.mockReturnValue(false)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('window crash recovery', () => {
  it('reloads failed renderers, logs the reason, and bounds repeated recovery', async () => {
    const win = windowMock()
    attachWindowRecovery(win as unknown as BrowserWindow, () => false)
    for (let i = 0; i < 5; i++) crash(win)
    expect(win.reload).toHaveBeenCalledTimes(3)
    expect(mocks.showMessageBox).toHaveBeenCalledOnce()
    expect(mocks.appendFileSync.mock.calls[0][1]).toContain('"reason":"crashed"')
    await Promise.resolve()
    expect(win.close).toHaveBeenCalledOnce()
  })
  it('allows recovery again after the one minute crash window', () => {
    vi.useFakeTimers()
    const win = windowMock()
    attachWindowRecovery(win as unknown as BrowserWindow, () => false)
    for (let i = 0; i < 3; i++) crash(win)
    vi.advanceTimersByTime(60_001)
    crash(win)
    expect(win.reload).toHaveBeenCalledTimes(4)
    expect(mocks.showMessageBox).not.toHaveBeenCalled()
  })
  it('ignores normal exits, shutdown, and destroyed windows', () => {
    const win = windowMock()
    let quitting = false
    attachWindowRecovery(win as unknown as BrowserWindow, () => quitting)
    crash(win, 'clean-exit')
    quitting = true
    crash(win)
    quitting = false
    win.isDestroyed.mockReturnValue(true)
    crash(win)
    expect(win.reload).not.toHaveBeenCalled()
    expect(mocks.showMessageBox).not.toHaveBeenCalled()
  })
  it('restarts Windows without GPU only after the user selects recovery', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.showMessageBox.mockResolvedValue({ response: 0 })
    const win = windowMock()
    attachWindowRecovery(win as unknown as BrowserWindow, () => false)
    for (let i = 0; i < 4; i++) crash(win)
    expect(mocks.relaunch).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(mocks.relaunch).toHaveBeenCalledWith({ args: [...process.argv.slice(1), '--disable-gpu'] })
    expect(mocks.quit).toHaveBeenCalledOnce()
  })
  it('still recovers when the diagnostic log cannot be written', () => {
    mocks.appendFileSync.mockImplementationOnce(() => { throw new Error('disk full') })
    const win = windowMock()
    attachWindowRecovery(win as unknown as BrowserWindow, () => false)
    crash(win, 'oom')
    expect(win.reload).toHaveBeenCalledOnce()
  })
})
