import { useEffect, useSyncExternalStore } from 'react'
import { DEFAULT_TERMINAL_SETTINGS, type TerminalSettings } from '@shared/terminalSettings'

let snapshot = { settings: DEFAULT_TERMINAL_SETTINGS, loaded: false, pending: 0, error: false }
const listeners = new Set<() => void>()
let loading: Promise<void> | undefined
let queue: Promise<void> = Promise.resolve()
function publish(patch: Partial<typeof snapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function loadTerminalSettings(): Promise<void> {
  if (snapshot.loaded) return Promise.resolve()
  if (!loading) loading = window.api.getSettings().then(s => {
    publish({ settings: s.terminal, loaded: true, error: false })
  }).catch(() => { publish({ error: true }) }).finally(() => { loading = undefined })
  return loading
}
/** Serialize patches so fast edits cannot overwrite each other or a newer response. */
export function saveTerminalSettings(patch: Partial<TerminalSettings>): Promise<void> {
  publish({ pending: snapshot.pending + 1, error: false })
  queue = queue.then(async () => {
    await loadTerminalSettings()
    if (!snapshot.loaded) throw new Error('Settings unavailable')
    const saved = await window.api.setTerminalSettings(patch)
    publish({ settings: saved.terminal })
  }).catch(() => { publish({ error: true }) }).finally(() => {
    publish({ pending: snapshot.pending - 1 })
  })
  return queue
}
export function useTerminalSettings(): typeof snapshot {
  const value = useSyncExternalStore(subscribe, () => snapshot)
  useEffect(() => { void loadTerminalSettings() }, [])
  return value
}
