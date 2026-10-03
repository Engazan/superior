import type { Terminal } from '@xterm/xterm'
import type { ISearchOptions, SearchAddon } from '@xterm/addon-search'

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

type SafeSearchOptions = Omit<ISearchOptions, 'decorations'>

/**
 * Run xterm search without match decorations. @xterm/addon-search 0.16 can
 * receive `undefined` from Terminal.registerMarker() for old scrollback rows
 * and then dereference `marker.line` while creating decorations. The exception
 * is synchronous, so when search is driven by a React effect it otherwise
 * reaches the app-wide error boundary and replaces the entire window.
 *
 * Selection-based search does not create markers and remains safe. Keep the
 * option type decoration-free so a caller cannot accidentally reintroduce the
 * crashing path, and contain any other stale-addon failure here as a final
 * guard during terminal teardown.
 */
export function findInTerminal(
  sessionId: string,
  query: string,
  direction: 'next' | 'previous',
  options?: SafeSearchOptions
): boolean {
  const entry = entries.get(sessionId)
  if (!entry || !query) return false
  try {
    return direction === 'next'
      ? entry.addon.findNext(query, options)
      : entry.addon.findPrevious(query, options)
  } catch (error) {
    console.error('[terminal-search] search failed:', error)
    return false
  }
}

/** Clear search state without allowing a stale/disposed addon to crash React cleanup. */
export function clearTerminalSearch(sessionId: string): void {
  try {
    entries.get(sessionId)?.addon.clearDecorations()
  } catch (error) {
    console.error('[terminal-search] clear failed:', error)
  }
}

/** Restore focus after closing search if the terminal is still mounted. */
export function focusTerminal(sessionId: string): void {
  try {
    entries.get(sessionId)?.terminal.focus()
  } catch {
    // The terminal may have been removed while its search overlay was open.
  }
}
