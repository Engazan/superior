import { useSyncExternalStore } from 'react'
import type { AgentUsage } from './types'

/**
 * A tiny renderer-side store for live Claude usage, keyed by session id. The main
 * process pushes an {@link AgentUsage} whenever a tracked session's token/cost
 * numbers move; we hold the latest per id and let components subscribe to one id.
 *
 * Snapshots are primed once from the main process so a renderer that loads after
 * a session already produced usage (e.g. after a reload) still shows it.
 */

const usage = new Map<string, AgentUsage>()
const listeners = new Set<() => void>()
let started = false
let primed = false

function emit(): void {
  for (const listener of listeners) listener()
}

function start(): void {
  if (started) return
  started = true

  window.api.onAgentUsage((next) => {
    usage.set(next.id, next)
    emit()
  })

  // Prime from whatever the main process already has.
  if (!primed) {
    primed = true
    window.api
      .getUsageSnapshots()
      .then((snapshots) => {
        let touched = false
        for (const snap of snapshots) {
          if (!usage.has(snap.id)) {
            usage.set(snap.id, snap)
            touched = true
          }
        }
        if (touched) emit()
      })
      .catch(() => {
        /* best-effort priming */
      })
  }
}

function subscribe(listener: () => void): () => void {
  start()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Begin listening to the main process. Safe to call repeatedly. */
export function ensureUsageStore(): void {
  start()
}

/** Drop all usage — used when the user turns tracking off, so badges disappear. */
export function clearUsageStore(): void {
  if (usage.size === 0) return
  usage.clear()
  emit()
}

/** Re-fetch current snapshots — used right after the user turns tracking on. */
export function primeUsageStore(): void {
  start()
  window.api
    .getUsageSnapshots()
    .then((snapshots) => {
      let touched = false
      for (const snap of snapshots) {
        usage.set(snap.id, snap)
        touched = true
      }
      if (touched) emit()
    })
    .catch(() => {
      /* best-effort */
    })
}

/** Subscribe a component to one session's live usage (null until any arrives). */
export function useUsage(sessionId: string): AgentUsage | null {
  return useSyncExternalStore(
    subscribe,
    () => usage.get(sessionId) ?? null,
    () => null
  )
}
