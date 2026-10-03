import { app, dialog, type BrowserWindow } from 'electron'
import { appendFileSync, existsSync, statSync, writeFileSync } from 'fs'
import { userDataFile } from '../lib/jsonStore'

/** Keep process failures available in packaged apps without a console. */
export function logWindowFailure(event: string, details: unknown): void {
  const line = `${JSON.stringify({ time: new Date().toISOString(), event, details })}\n`
  console.error('[window]', line.trim())
  try {
    const file = userDataFile('window-failures.log')
    if (existsSync(file) && statSync(file).size >= 1024 * 1024) writeFileSync(file, '')
    appendFileSync(file, line, 'utf8')
  } catch { /* Diagnostics must never prevent recovery. */ }
}

export function attachWindowRecovery(win: BrowserWindow, isQuitting: () => boolean): void {
  let crashes: number[] = []
  let recoveryStopped = false
  win.on('unresponsive', () => logWindowFailure('unresponsive', { windowId: win.id }))
  win.webContents.on('render-process-gone', (_event, details) => {
    if (isQuitting() || win.isDestroyed() || details.reason === 'clean-exit') return
    logWindowFailure('render-process-gone', { windowId: win.id, ...details })
    if (recoveryStopped) return
    const now = Date.now()
    crashes = crashes.filter(time => now - time < 60_000)
    crashes.push(now)
    if (crashes.length <= 3) {
      // PTYs live in the daemon; the new renderer reattaches to surviving sessions.
      win.reload()
      return
    }
    recoveryStopped = true
    const softwareRestart = process.platform === 'win32' && !app.commandLine.hasSwitch('disable-gpu')
    void dialog.showMessageBox(win, {
      type: 'error',
      title: 'Superior',
      message: 'The application window stopped unexpectedly several times.',
      detail: softwareRestart
        ? 'Restart with GPU acceleration disabled to try to recover the window. Unsaved editor changes may have been lost.'
        : 'Restart the application to try to recover the window. Unsaved editor changes may have been lost.',
      buttons: [softwareRestart ? 'Restart without GPU acceleration' : 'Restart', 'Close window'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }).then(({ response }) => {
      if (isQuitting() || win.isDestroyed()) return
      if (response === 0) {
        app.relaunch({ args: process.argv.slice(1).concat(softwareRestart ? ['--disable-gpu'] : []) })
        app.quit()
      } else {
        win.close()
      }
    }).catch(error => logWindowFailure('recovery-dialog-failed', String(error)))
  })
}
