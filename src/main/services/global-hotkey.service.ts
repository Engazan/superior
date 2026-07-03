import { app, BrowserWindow, globalShortcut } from 'electron'

/**
 * System-wide show/hide hotkey. Chords are stored in the app's own format
 * ('mod+shift+space') so the existing renderer recorder is reused; this module
 * maps them to Electron accelerators and owns the registration lifecycle.
 */

/** Map an app chord token to an Electron accelerator token, or null if impossible. */
function tokenToAccelerator(token: string): string | null {
  switch (token) {
    case 'mod':
      return 'CommandOrControl'
    case 'ctrl':
      return 'Control'
    case 'alt':
      return 'Alt'
    case 'shift':
      return 'Shift'
    case 'meta':
      return 'Super'
    case 'space':
      return 'Space'
    case 'enter':
      return 'Return'
    case 'escape':
      return 'Escape'
    case 'tab':
      return 'Tab'
    case 'backspace':
      return 'Backspace'
    case 'delete':
      return 'Delete'
    case 'arrowup':
      return 'Up'
    case 'arrowdown':
      return 'Down'
    case 'arrowleft':
      return 'Left'
    case 'arrowright':
      return 'Right'
    default:
      // Single printable character (letters, digits, most punctuation).
      if (token.length === 1 && /[\x20-\x7e]/.test(token)) return token.toUpperCase()
      // F-keys.
      if (/^f([1-9]|1\d|2[0-4])$/.test(token)) return token.toUpperCase()
      return null
  }
}

/** Convert an app chord ('mod+shift+k') to an Electron accelerator, or null. */
export function chordToAccelerator(chord: string): string | null {
  const tokens = chord.split('+').filter(Boolean)
  if (tokens.length === 0) return null
  const mapped: string[] = []
  for (const token of tokens) {
    const acc = tokenToAccelerator(token)
    if (!acc) return null
    mapped.push(acc)
  }
  return mapped.join('+')
}

let registered: string | null = null

/**
 * (Re)register the global hotkey for `chord` (app format); pass null to just
 * unregister. Returns an error string when the chord can't be mapped or the OS
 * refuses the registration (e.g. taken by another app).
 */
export function applyGlobalHotkey(
  chord: string | null,
  getWindow: () => BrowserWindow | null
): string | null {
  if (registered) {
    globalShortcut.unregister(registered)
    registered = null
  }
  if (!chord) return null

  const accelerator = chordToAccelerator(chord)
  if (!accelerator) return `Unsupported key combination: ${chord}`

  const ok = globalShortcut.register(accelerator, () => {
    const win = getWindow()
    if (!win) return
    if (win.isFocused()) {
      // Hide rather than minimize: on macOS this returns focus to the app you
      // were in, which is the quake-style toggle people expect.
      if (process.platform === 'darwin') app.hide()
      else win.minimize()
    } else {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })
  if (!ok) return `The combination is already in use by another application.`
  registered = accelerator
  return null
}

/** Release the hotkey (call on will-quit). */
export function releaseGlobalHotkey(): void {
  globalShortcut.unregisterAll()
  registered = null
}
