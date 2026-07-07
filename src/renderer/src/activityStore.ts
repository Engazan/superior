import { useSyncExternalStore } from 'react'
import type { AgentSession } from './types'

/** A session goes idle this long after its last chunk of PTY output. */
const IDLE_MS = 400
/**
 * Extra quiet time after busy→idle before the OS "finished" notification fires.
 * Agents routinely pause longer than IDLE_MS between tool calls; the busy pulse
 * may flicker, but a notification is irrevocable, so it waits for a gap long
 * enough to mean "actually done". Output resuming cancels the pending one.
 */
const NOTIFY_QUIET_MS = 3000

/**
 * Renderer-side store deriving transient signals from the raw PTY data stream,
 * kept outside React so per-chunk activity never re-renders the app — only the
 * components subscribed here (sidebar, terminal chrome) update, and only when
 * the *derived* sets actually change:
 *
 * - **busy sessions/workspaces**: a session is busy while output keeps arriving
 *   and goes idle IDLE_MS after its last chunk; its workspace is busy while any
 *   of its running sessions are.
 * - **attention sessions**: a busy→idle finish flags the session (unless it is
 *   the focused cell of a focused app) until the user focuses its cell, so the
 *   user can tell *which* terminal finished, not just which workspace.
 * - **attention workspaces**: a finish in an unfocused workspace flags it so the
 *   sidebar can pulse its tab. Focusing the workspace clears the flag, and
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
let activeSession: string | null = null
const busySessions = new Set<string>()
const attention = new Set<string>()
const sessionAttention = new Set<string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const notifyTimers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
let started = false

// Snapshots handed to useSyncExternalStore — replaced only on real change so
// unchanged reads keep the same reference and subscribers skip re-rendering.
let busyWorkspacesSnap = new Set<string>()
let busySessionsSnap = new Set<string>()
let attentionSnap = new Set<string>()
let sessionAttentionSnap = new Set<string>()

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
  if (!setsEqual(busySessions, busySessionsSnap)) {
    busySessionsSnap = new Set(busySessions)
    changed = true
  }
  if (!setsEqual(attention, attentionSnap)) {
    attentionSnap = new Set(attention)
    changed = true
  }
  if (!setsEqual(sessionAttention, sessionAttentionSnap)) {
    sessionAttentionSnap = new Set(sessionAttention)
    changed = true
  }
  if (changed) for (const listener of listeners) listener()
}

// Optional hook fired when a session finishes (busy → idle); App installs it
// to raise a native OS notification when the whole app is unfocused.
let notifier: ((sessionId: string, workspaceId: string) => void) | null = null

/** Install the finished-session callback (App wires OS notifications here). */
export function setActivityNotifier(
  fn: ((sessionId: string, workspaceId: string) => void) | null
): void {
  notifier = fn
}

// busy → idle for a session that was producing output: clear busy, then raise
// attention unless that session is currently in front of the user. The OS
// notification waits out NOTIFY_QUIET_MS (or fires at once when the process
// exited — there is nothing left to wait for).
function finish(id: string, exited = false): void {
  timers.delete(id)
  busySessions.delete(id)
  const wsId = sessionInfo.get(id)?.workspaceId
  if (wsId && wsId !== activeWs) attention.add(wsId)
  // The focused cell of a focused app is being watched — flagging it would turn
  // every finished `ls` into noise. Everything else keeps its flag until seen.
  if (id !== activeSession || !document.hasFocus()) sessionAttention.add(id)
  if (wsId) {
    if (exited) {
      notifier?.(id, wsId)
    } else {
      const pending = notifyTimers.get(id)
      if (pending) clearTimeout(pending)
      notifyTimers.set(
        id,
        setTimeout(() => {
          notifyTimers.delete(id)
          notifier?.(id, wsId)
        }, NOTIFY_QUIET_MS - IDLE_MS)
      )
    }
  }
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
      // idle → busy: this session is producing output again. Any attention or
      // pending notification we raised was a false positive — the agent merely
      // paused mid-task rather than finishing — so drop them too.
      busySessions.add(id)
      sessionAttention.delete(id)
      const wsId = sessionInfo.get(id)?.workspaceId
      if (wsId) attention.delete(wsId)
      const pendingNotify = notifyTimers.get(id)
      if (pendingNotify) {
        clearTimeout(pendingNotify)
        notifyTimers.delete(id)
      }
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
      finish(id, true)
    }
  })
}

/** Feed the current session list (id → workspace, running) from App state. */
export function setActivitySessions(sessions: AgentSession[]): void {
  const next = new Map<string, SessionInfo>()
  for (const s of sessions) {
    next.set(s.id, { workspaceId: s.workspaceId, running: s.status === 'running' })
  }
  // Drop attention/timers for sessions that no longer exist (closed cells).
  for (const id of [...sessionAttention]) if (!next.has(id)) sessionAttention.delete(id)
  for (const [id, timer] of [...notifyTimers]) {
    if (!next.has(id)) {
      clearTimeout(timer)
      notifyTimers.delete(id)
    }
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

/**
 * Track the focused session: focusing a cell counts as seeing its finished
 * flag, so the attention dot clears the moment the user lands in the terminal.
 */
export function setActivityActiveSession(id: string | null): void {
  activeSession = id
  if (id && sessionAttention.has(id)) {
    sessionAttention.delete(id)
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

/** Session ids currently producing output. */
export function useBusySessions(): Set<string> {
  return useSyncExternalStore(
    subscribe,
    () => busySessionsSnap,
    () => busySessionsSnap
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

/** Session ids that finished and haven't been seen yet. */
export function useAttentionSessions(): Set<string> {
  return useSyncExternalStore(
    subscribe,
    () => sessionAttentionSnap,
    () => sessionAttentionSnap
  )
}
