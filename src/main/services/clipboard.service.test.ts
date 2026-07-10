import { describe, expect, it } from 'vitest'
import { MAX_CLIPBOARD_IMAGE_BYTES, saveClipboardImage } from './clipboard.service'

describe('saveClipboardImage', () => {
  it('rejects an oversized renderer payload before writing a temp file', async () => {
    await expect(
      saveClipboardImage(new Uint8Array(MAX_CLIPBOARD_IMAGE_BYTES + 1), 'png')
    ).rejects.toThrow('Clipboard image is too large.')
  })
})
