import { useSyncExternalStore } from 'react'
import type { AgentSession } from './types'
import { TerminalSignals } from './terminalSignals'

/** Output pulse only: silence says nothing about whether the task is done. */
const IDLE_MS = 400

/**
 * Renderer-side store deriving transient signals from the raw PTY data stream,
 * kept outside React so per-chunk activity never re-renders the app — only the
 * components subscribed here (sidebar, terminal chrome) update, and only when
 * the *derived* sets actually change:
 *
 * - **busy sessions/workspaces**: a session is busy while output keeps arriving
 *   and goes idle IDLE_MS after its last chunk; its workspace is busy while any
 *   of its running sessions are.
 * - **attention sessions**: an explicit terminal alert or process exit flags
 *   the session (unless it is the focused cell of a focused app) until the user
 *   focuses its cell, so they can tell which terminal needs attention.
 * - **attention workspaces**: derived from unread session alerts. Output and
 *   redraws never acknowledge an alert or re-arm native notifications.
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
const signals = new Map<string, TerminalSignals>()
// At most one notification per interaction, even if the CLI rings repeatedly.
const reported = new Set<string>()
const pendingReports = new Map<string, object>()
const exitedSessions = new Set<string>()
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
  attention.clear()
  for (const id of sessionAttention) {
    const wsId = sessionInfo.get(id)?.workspaceId
    if (wsId && wsId !== activeWs) attention.add(wsId)
  }
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

type Notifier = (sessionId: string, workspaceId: string, isCurrent: () => boolean) => void
let notifier: Notifier | null = null

/** Install the explicit-attention callback (App wires OS notifications here). */
export function setActivityNotifier(fn: Notifier | null): void {
  notifier = fn
}

function stopOutput(id: string): void {
  const timer = timers.get(id)
  if (timer !== undefined) clearTimeout(timer)
  timers.delete(id)
  busySessions.delete(id)
}

function requestAttention(id: string): void {
  stopOutput(id)
  const wsId = sessionInfo.get(id)?.workspaceId
  if (!wsId) return
  if (!reported.has(id)) {
    reported.add(id)
    if (id !== activeSession || !document.hasFocus()) sessionAttention.add(id)
    if (!document.hasFocus()) {
      const token = {}
      pendingReports.set(id, token)
      notifier?.(id, wsId, () => pendingReports.get(id) === token && sessionInfo.has(id))
    }
  }
  refresh()
}

/** New user input acknowledges the alert and allows the next interaction to notify. */
export function noteActivityInput(id: string): void {
  reported.delete(id)
  pendingReports.delete(id)
  sessionAttention.delete(id)
  refresh()
}

function start(): void {
  if (started) return
  started = true

  window.addEventListener('focus', () => {
    // Cancel callbacks awaiting settings, including alerts in other cells.
    pendingReports.clear()
    if (activeSession) sessionAttention.delete(activeSession)
    refresh()
  })

  window.api.onAgentData(({ id, data, replay }) => {
    if (replay || !data || !sessionInfo.get(id)?.running || exitedSessions.has(id)) return
    let parser = signals.get(id)
    if (!parser) {
      parser = new TerminalSignals()
      signals.set(id, parser)
    }
    if (parser.read(data)) {
      requestAttention(id)
      return
    }
    const existing = timers.get(id)
    if (existing !== undefined) clearTimeout(existing)
    busySessions.add(id)
    timers.set(
      id,
      setTimeout(() => {
        stopOutput(id)
        refresh()
      }, IDLE_MS)
    )
    if (!existing) refresh()
  })

  // An actual exit is authoritative even for silent processes. A lost daemon
  // connection is not an exit and must not announce completion.
  window.api.onAgentExit(({ id, exitCode, reason }) => {
    if (!sessionInfo.has(id) || exitedSessions.has(id)) return
    exitedSessions.add(id)
    stopOutput(id)
    signals.delete(id)
    if (reason !== 'interrupted' && exitCode !== null) requestAttention(id)
    else {
      pendingReports.delete(id)
      refresh()
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
  for (const id of sessionInfo.keys()) {
    if (!next.has(id)) {
      stopOutput(id)
      signals.delete(id)
      reported.delete(id)
      pendingReports.delete(id)
      exitedSessions.delete(id)
    }
  }
  for (const [id, info] of next) {
    if (!info.running) {
      stopOutput(id)
      signals.delete(id)
    }
  }
  sessionInfo = next
  refresh()
}

/** Track the focused workspace; focusing one dismisses its pulse. */
export function setActivityActiveWorkspace(id: string | null): void {
  activeWs = id
  refresh()
}

/**
 * Track the focused session: focusing a cell counts as seeing its attention
 * flag, so the attention dot clears the moment the user lands in the terminal.
 */
export function setActivityActiveSession(id: string | null): void {
  activeSession = id
  if (id && document.hasFocus()) {
    pendingReports.delete(id)
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

/** Workspace ids with unread explicit terminal alerts. */
export function useAttentionWorkspaces(): Set<string> {
  return useSyncExternalStore(
    subscribe,
    () => attentionSnap,
    () => attentionSnap
  )
}

/** Session ids with unread explicit terminal alerts. */
export function useAttentionSessions(): Set<string> {
  return useSyncExternalStore(
    subscribe,
    () => sessionAttentionSnap,
    () => sessionAttentionSnap
  )
}
