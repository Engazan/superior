import type { Terminal } from '@xterm/xterm'
import type { SearchAddon } from '@xterm/addon-search'

/**
 * Renderer-side registry of per-session xterm SearchAddons, so the search
 * overlay (owned by App) can drive the focused terminal's search without
 * threading new props through the memoized TerminalView.
 */
interface Entry {
  addon: SearchAddon
  /** the terminal itself, to restore focus when the overlay closes */
  terminal: Terminal
}

const entries = new Map<string, Entry>()

export function registerSearch(sessionId: string, addon: SearchAddon, terminal: Terminal): void {
  entries.set(sessionId, { addon, terminal })
}

export function unregisterSearch(sessionId: string): void {
  entries.delete(sessionId)
}

export function getSearch(sessionId: string): Entry | undefined {
  return entries.get(sessionId)
}
