import { useSyncExternalStore } from 'react'
import type { AgentSession } from './types'

/** A session goes idle this long after its last chunk of PTY output. */
const IDLE_MS = 400

/**
 * Renderer-side store deriving two transient signals from the raw PTY data
 * stream, kept outside React so per-chunk activity never re-renders the app —
 * only the components subscribed here (the sidebar) update, and only when the
 * *derived* sets actually change:
 *
 * - **busy workspaces**: a session is busy while output keeps arriving and goes
 *   idle IDLE_MS after its last chunk; its workspace is busy while any of its
 *   running sessions are.
 * - **attention workspaces**: when a session finishes (busy→idle, or exits while
 *   busy) and its workspace is *not* the focused one, that workspace is flagged
 *   so the sidebar can pulse its tab. Focusing a workspace clears its flag, and
 *   output resuming after an idle gap drops it — the pause was mid-task, not
 *   the end of the prompt.
 *
 * Replay chunks (scrollback restored on attach) are ignored, so reattaching a
 * session never looks busy or raises attention.
 */

interface SessionInfo {
  workspaceId: string
  running: boolean
}

let sessionInfo = new Map<string, SessionInfo>()
let activeWs: string | null = null
const busySessions = new Set<string>()
const attention = new Set<string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
let started = false

// Snapshots handed to useSyncExternalStore — replaced only on real change so
// unchanged reads keep the same reference and subscribers skip re-rendering.
let busyWorkspacesSnap = new Set<string>()
let attentionSnap = new Set<string>()

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

function refresh(): void {
  const busyWs = new Set<string>()
  for (const id of busySessions) {
    const info = sessionInfo.get(id)
    if (info?.running) busyWs.add(info.workspaceId)
  }
  let changed = false
  if (!setsEqual(busyWs, busyWorkspacesSnap)) {
    busyWorkspacesSnap = busyWs
    changed = true
  }
  if (!setsEqual(attention, attentionSnap)) {
    attentionSnap = new Set(attention)
    changed = true
  }
  if (changed) for (const listener of listeners) listener()
}

// busy → idle for a session that was producing output: clear busy, then raise
// attention on its workspace unless that workspace is focused.
function finish(id: string): void {
  timers.delete(id)
  busySessions.delete(id)
  const wsId = sessionInfo.get(id)?.workspaceId
  if (wsId && wsId !== activeWs) attention.add(wsId)
  refresh()
}

function start(): void {
  if (started) return
  started = true

  window.api.onAgentData(({ id, replay }) => {
    if (replay) return
    const existing = timers.get(id)
    if (existing) clearTimeout(existing)
    else {
      // idle → busy: this session is producing output again. Any attention we
      // raised for its workspace was a false positive — the agent merely paused
      // mid-task rather than finishing — so drop the flag too.
      busySessions.add(id)
      const wsId = sessionInfo.get(id)?.workspaceId
      if (wsId) attention.delete(wsId)
    }
    timers.set(
      id,
      setTimeout(() => finish(id), IDLE_MS)
    )
    if (!existing) refresh()
  })

  // A process that exits while busy has "finished" too — flush it now.
  window.api.onAgentExit(({ id }) => {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      finish(id)
    }
  })
}

/** Feed the current session list (id → workspace, running) from App state. */
export function setActivitySessions(sessions: AgentSession[]): void {
  const next = new Map<string, SessionInfo>()
  for (const s of sessions) {
    next.set(s.id, { workspaceId: s.workspaceId, running: s.status === 'running' })
  }
  sessionInfo = next
  refresh()
}

/** Track the focused workspace; focusing one dismisses its pulse. */
export function setActivityActiveWorkspace(id: string | null): void {
  activeWs = id
  if (id && attention.has(id)) {
    attention.delete(id)
    refresh()
  }
}

function subscribe(listener: () => void): () => void {
  start()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Workspace ids with a running session currently producing output. */
export function useBusyWorkspaces(): Set<string> {
  return useSyncExternalStore(
    subscribe,
    () => busyWorkspacesSnap,
    () => busyWorkspacesSnap
  )
}

/** Workspace ids whose terminal finished while the workspace was unfocused. */
export function useAttentionWorkspaces(): Set<string> {
  return useSyncExternalStore(
    subscribe,
    () => attentionSnap,
    () => attentionSnap
  )
}
