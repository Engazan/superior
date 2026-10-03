import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {},
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() }
}))

import { chordToAccelerator } from './global-hotkey.service'

describe('chordToAccelerator', () => {
  it('maps platform-neutral modifiers and named keys to Electron accelerators', () => {
    expect(chordToAccelerator('mod+shift+space')).toBe('CommandOrControl+Shift+Space')
    expect(chordToAccelerator('ctrl+alt+arrowleft')).toBe('Control+Alt+Left')
    expect(chordToAccelerator('meta+enter')).toBe('Super+Return')
  })

  it('normalizes printable characters and supported function keys', () => {
    expect(chordToAccelerator('mod+k')).toBe('CommandOrControl+K')
    expect(chordToAccelerator('f24')).toBe('F24')
  })

  it('rejects empty and unsupported chords', () => {
    expect(chordToAccelerator('')).toBeNull()
    expect(chordToAccelerator('mod+volumeup')).toBeNull()
    expect(chordToAccelerator('f25')).toBeNull()
  })
})
