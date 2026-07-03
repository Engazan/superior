import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import { IPC } from '@shared/types'

interface FinishedPayload {
  workspaceId: string
  title: string
  body: string
}

/**
 * Native OS notifications for "agent finished while the app is unfocused",
 * plus the dock/taskbar badge mirroring the attention-workspace count.
 * The renderer decides *when* to notify (it owns the activity store and the
 * notifications setting); main only presents.
 */
export function registerNotificationsIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.on(IPC.NOTIFY_FINISHED, (_event, payload: FinishedPayload) => {
    if (!Notification.isSupported()) return
    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      silent: false
    })
    // Clicking the notification brings the app forward on the right workspace.
    notification.on('click', () => {
      const win = getWindow()
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send(IPC.NOTIFY_ACTIVATED, payload.workspaceId)
    })
    notification.show()
  })

  ipcMain.on(IPC.APP_SET_BADGE, (_event, count: number) => {
    // Dock badge on macOS, taskbar badge on Linux; harmless no-op elsewhere.
    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(Math.max(0, Math.floor(count)))
    }
  })
}
