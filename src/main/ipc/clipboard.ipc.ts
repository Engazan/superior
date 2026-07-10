import { IPC } from '@shared/types'
import { saveClipboardImage } from '../services/clipboard.service'
import { handle } from './handle'

export function registerClipboardIpc(): void {
  handle(
    IPC.CLIPBOARD_SAVE_IMAGE,
    (payload: { bytes: Uint8Array; ext: string }): Promise<{ path: string }> =>
      saveClipboardImage(payload.bytes, payload.ext)
  )
}
