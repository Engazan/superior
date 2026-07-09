import { ipcMain } from 'electron'
import { IPC } from '@shared/types'
import { saveClipboardImage } from '../services/clipboard.service'

export function registerClipboardIpc(): void {
  ipcMain.handle(
    IPC.CLIPBOARD_SAVE_IMAGE,
    (_e, payload: { bytes: Uint8Array; ext: string }): Promise<{ path: string }> =>
      saveClipboardImage(payload.bytes, payload.ext)
  )
}
