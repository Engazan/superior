import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/types'

/**
 * Register the global window-control handlers once. Each handler resolves the
 * window from the calling renderer, so it works for any (current/future) window.
 */
export function registerWindowIpc(): void {
  ipcMain.on(IPC.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on(IPC.WINDOW_MAXIMIZE_TOGGLE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on(IPC.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, (event): boolean => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
}

/** Forward maximize/unmaximize state to a specific window's renderer. */
export function attachWindowMaximizeEvents(win: BrowserWindow): void {
  const send = (): void => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, win.isMaximized())
    }
  }
  win.on('maximize', send)
  win.on('unmaximize', send)
}
