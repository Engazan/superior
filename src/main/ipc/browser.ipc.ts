import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { BROWSER_IPC } from '@shared/browser'
import { BrowserService } from '../services/browser.service'
import { handleWithEvent } from './handle'

export const browserService = new BrowserService()

export function registerBrowserIpc(getWindow: () => BrowserWindow | null): void {
  const owner = (event: IpcMainInvokeEvent): BrowserWindow => {
    const window = getWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Browser controls are only available to the app.')
    }
    return window
  }
  handleWithEvent(BROWSER_IPC.REQUEST, (event, args) => browserService.request(owner(event), args))
  handleWithEvent(BROWSER_IPC.SEND, (event, args) => browserService.send(owner(event), args))
  ipcMain.on(BROWSER_IPC.PICK, (event, data: unknown) => { void browserService.pick(event, data).catch((error) => console.error('[browser] selection failed:', error)) })
}
