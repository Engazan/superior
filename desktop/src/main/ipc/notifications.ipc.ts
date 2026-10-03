import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import { IPC } from '@shared/types'
import { getSettings } from '../services/settings.service'

interface FinishedPayload {
  sessionId: string
  workspaceId: string
  title: string
  body: string
}

/**
 * Native OS notifications for explicit terminal attention while unfocused,
 * plus the dock/taskbar badge mirroring the attention-workspace count.
 * The renderer decides *when* to notify (it owns the activity store and the
 * notifications setting); main rechecks focus and settings before presenting.
 */
export function registerNotificationsIpc(getWindow: () => BrowserWindow | null): void {
  const notifications = new Map<string, Notification>()
  ipcMain.on(IPC.NOTIFY_FINISHED, (event, payload: FinishedPayload) => {
    if (
      !payload ||
      typeof payload.sessionId !== 'string' ||
      !payload.sessionId ||
      payload.sessionId.length > 256 ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.title !== 'string' ||
      typeof payload.body !== 'string' ||
      payload.workspaceId.length > 256 ||
      payload.title.length > 500 ||
      payload.body.length > 5_000
    ) return
    const win = getWindow()
    // Recheck at the final delivery boundary: renderer focus/settings may have
    // changed while its asynchronous settings lookup or IPC message was queued.
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return
    if (win.isFocused() || !getSettings().notifications) return
    if (!Notification.isSupported()) return
    notifications.get(payload.sessionId)?.close()
    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      silent: false
    })
    notifications.set(payload.sessionId, notification)
    notification.on('close', () => {
      if (notifications.get(payload.sessionId) === notification) {
        notifications.delete(payload.sessionId)
      }
    })
    // Clicking the notification brings the app forward on the right workspace.
    notification.on('click', () => {
      const win = getWindow()
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send(IPC.NOTIFY_ACTIVATED, payload.workspaceId)
    })
    notification.show()
  })

  ipcMain.on(IPC.APP_SET_BADGE, (_event, count: number) => {
    if (!Number.isFinite(count)) return
    // Dock badge on macOS, taskbar badge on Linux; harmless no-op elsewhere.
    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(Math.max(0, Math.floor(count)))
    }
  })
}
