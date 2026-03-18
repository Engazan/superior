import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ShortcutAction, ShortcutMap } from './types'

/** Built-in bindings, also used when a user resets an action. */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  toggleSidebar: 'mod+b',
  openSettings: 'mod+,',
  maximizeFocusedCell: 'ctrl+enter',
  openLauncher: 'ctrl+§',
  toggleRightPanel: 'mod+j',
  closeFocusedCell: 'mod+w',
  closePreview: 'mod+shift+w'
}

const isMac = window.api.platform === 'darwin'

/**
 * While a shortcut is being (re)bound in settings we suppress the global action
 * dispatcher so the recorded chord doesn't also fire its action. Module-level so
 * both the recorder and the dispatcher (registered in different components on the
 * same `window`, where capture order is fixed by registration) can coordinate.
 */
let recording = false
export function setRecording(value: boolean): void {
  recording = value
}
export function isRecordingShortcut(): boolean {
  return recording
}

function normalizeKey(key: string): string {
  if (key === ' ') return 'space'
  return key.toLowerCase()
}

/**
 * Build the normalized chord for a keyboard event, or null when only modifier
 * keys are held (so a recorder keeps waiting for the real key). The primary
 * modifier (⌘ on macOS, Ctrl elsewhere) is encoded as `mod` for portability.
 */
export function eventToChord(e: KeyboardEvent): string | null {
  const { key } = e
  if (key === 'Meta' || key === 'Control' || key === 'Alt' || key === 'Shift') return null

  const parts: string[] = []
  const primary = isMac ? e.metaKey : e.ctrlKey
  const secondary = isMac ? e.ctrlKey : e.metaKey
  if (primary) parts.push('mod')
  if (secondary) parts.push(isMac ? 'ctrl' : 'meta')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(normalizeKey(key))
  return parts.join('+')
}

/** Human-readable rendering of a stored chord, platform-aware. */
export function formatChord(chord: string): string {
  const token = (part: string): string => {
    switch (part) {
      case 'mod':
        return isMac ? '⌘' : 'Ctrl'
      case 'ctrl':
        return isMac ? '⌃' : 'Ctrl'
      case 'meta':
        return isMac ? '⌘' : 'Win'
      case 'alt':
        return isMac ? '⌥' : 'Alt'
      case 'shift':
        return isMac ? '⇧' : 'Shift'
      case 'space':
        return 'Space'
      default:
        return part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)
    }
  }
  return chord.split('+').map(token).join(isMac ? ' ' : '+')
}

interface ShortcutsContextValue {
  shortcuts: ShortcutMap
  setShortcut: (action: ShortcutAction, chord: string) => void
  resetShortcut: (action: ShortcutAction) => void
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null)

export function ShortcutsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [shortcuts, setShortcuts] = useState<ShortcutMap>({ ...DEFAULT_SHORTCUTS })

  // Load the persisted bindings once.
  useEffect(() => {
    window.api.getSettings().then((s) => setShortcuts(s.shortcuts))
  }, [])

  const persist = (next: ShortcutMap): void => {
    setShortcuts(next)
    window.api.setShortcuts(next)
  }

  const setShortcut = (action: ShortcutAction, chord: string): void =>
    persist({ ...shortcuts, [action]: chord })

  const resetShortcut = (action: ShortcutAction): void =>
    persist({ ...shortcuts, [action]: DEFAULT_SHORTCUTS[action] })

  return (
    <ShortcutsContext.Provider value={{ shortcuts, setShortcut, resetShortcut }}>
      {children}
    </ShortcutsContext.Provider>
  )
}

export function useShortcuts(): ShortcutsContextValue {
  const ctx = useContext(ShortcutsContext)
  if (!ctx) throw new Error('useShortcuts must be used within a ShortcutsProvider')
  return ctx
}

/**
 * Returns a builder for button tooltips that pairs a human description with the
 * action's current chord, e.g. `Toggle sidebar (⌘ B)`. Reads live bindings, so a
 * tooltip reflects a rebind immediately. Use as the `title` of a button whose
 * click performs the same action as the shortcut.
 */
export function useShortcutTitle(): (description: string, action: ShortcutAction) => string {
  const { shortcuts } = useShortcuts()
  return (description, action) => `${description} (${formatChord(shortcuts[action])})`
}
