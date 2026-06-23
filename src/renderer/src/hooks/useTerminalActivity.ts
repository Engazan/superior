import { useEffect, useRef, useState } from 'react'
import type { AgentSession } from '../types'

/** A session goes idle this long after its last chunk of PTY output. */
const IDLE_MS = 400

export interface TerminalActivity {
  /** Session ids currently producing output (drives the "working" spinner). */
  busy: Set<string>
  /** Workspace ids whose terminal finished while the workspace was unfocused. */
  attention: Set<string>
}

/**
 * Derives two transient signals from the raw PTY data stream:
 *
 * - **busy**: a session is busy while output keeps arriving and goes idle
 *   IDLE_MS after its last chunk. State only flips on transitions (idle↔busy),
 *   so high-frequency output doesn't thrash React.
 * - **attention**: when a session finishes (busy→idle, or exits while busy) and
 *   its workspace is *not* the focused one, that workspace is flagged so the
 *   sidebar can pulse its tab. Focusing a workspace clears its flag, and a
 *   terminal that finishes while its workspace is focused never flags it. If the
 *   session starts producing output again, the flag is dropped — the idle gap
 *   was a mid-task pause, not the end of the prompt, so the tab must not pulse
 *   while work is still streaming.
 *
 * Replay chunks (scrollback restored on attach) are ignored, so reattaching a
 * session never looks busy or raises attention. (Workspace switches are kept
 * quiet upstream: TerminalView never resizes a hidden pty, so switching never
 * provokes the SIGWINCH redraw that would otherwise look like activity.)
 */
export function useTerminalActivity(
  sessions: AgentSession[],
  activeWorkspaceId: string | null
): TerminalActivity {
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  const [attention, setAttention] = useState<Set<string>>(() => new Set())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Latest-value refs so the once-registered IPC handlers read current focus and
  // the current session→workspace mapping without re-subscribing.
  const activeWsRef = useRef(activeWorkspaceId)
  activeWsRef.current = activeWorkspaceId
  const wsOfRef = useRef<Map<string, string>>(new Map())
  const map = new Map<string, string>()
  for (const s of sessions) map.set(s.id, s.workspaceId)
  wsOfRef.current = map

  // Focusing a workspace dismisses its pulse.
  useEffect(() => {
    if (!activeWorkspaceId) return
    setAttention((prev) => {
      if (!prev.has(activeWorkspaceId)) return prev
      const next = new Set(prev)
      next.delete(activeWorkspaceId)
      return next
    })
  }, [activeWorkspaceId])

  useEffect(() => {
    // busy → idle for a session that was producing output: clear busy, then
    // raise attention on its workspace unless that workspace is focused.
    const finish = (id: string): void => {
      timers.current.delete(id)
      setBusy((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      const wsId = wsOfRef.current.get(id)
      if (!wsId || wsId === activeWsRef.current) return
      setAttention((prev) => {
        if (prev.has(wsId)) return prev
        const next = new Set(prev)
        next.add(wsId)
        return next
      })
    }

    const offData = window.api.onAgentData(({ id, replay }) => {
      if (replay) return
      const existing = timers.current.get(id)
      if (existing) clearTimeout(existing)
      else {
        // idle → busy: this session is producing output again.
        setBusy((prev) => {
          if (prev.has(id)) return prev
          const next = new Set(prev)
          next.add(id)
          return next
        })
        // Output resumed after an idle gap, so any attention we raised for this
        // workspace was a false positive — the agent merely paused mid-task
        // (thinking, waiting on a tool) rather than finishing. Drop the flag so
        // the tab stops pulsing while work is still streaming; it'll be raised
        // again only if the session goes idle for good.
        const wsId = wsOfRef.current.get(id)
        if (wsId)
          setAttention((prev) => {
            if (!prev.has(wsId)) return prev
            const next = new Set(prev)
            next.delete(wsId)
            return next
          })
      }
      timers.current.set(
        id,
        setTimeout(() => finish(id), IDLE_MS)
      )
    })

    // A process that exits while busy has "finished" too — flush it now.
    const offExit = window.api.onAgentExit(({ id }) => {
      if (timers.current.has(id)) {
        clearTimeout(timers.current.get(id) as ReturnType<typeof setTimeout>)
        finish(id)
      }
    })

    return () => {
      offData()
      offExit()
      for (const t of timers.current.values()) clearTimeout(t)
      timers.current.clear()
    }
  }, [])

  return { busy, attention }
}
