import type { AgentDataEvent, AgentExitEvent } from './types'

/**
 * A tiny renderer-side pub/sub over the preload's agent events.
 *
 * It buffers output (and a pending exit) for any session id that has no active
 * subscriber yet, so a TerminalView that mounts slightly after its pty was
 * spawned still receives every chunk — important for fast exits like
 * command-not-found.
 */
interface Subscriber {
  onData: (data: string, replay: boolean) => void
  onExit: (e: AgentExitEvent) => void
}

const dataBuffer = new Map<string, AgentDataEvent[]>()
const exitBuffer = new Map<string, AgentExitEvent>()
const subscribers = new Map<string, Subscriber>()
let started = false

function start(): void {
  if (started) return
  started = true

  window.api.onAgentData(({ id, data, replay }) => {
    const sub = subscribers.get(id)
    if (sub) {
      sub.onData(data, replay === true)
      return
    }
    const buf = dataBuffer.get(id) ?? []
    buf.push({ id, data, replay })
    dataBuffer.set(id, buf)
  })

  window.api.onAgentExit((e) => {
    const sub = subscribers.get(e.id)
    if (sub) sub.onExit(e)
    else exitBuffer.set(e.id, e)
  })
}

/** Begin listening to the main process. Safe to call repeatedly. */
export function ensureBus(): void {
  start()
}

/** Subscribe a view to a session. Drains any buffered output/exit immediately. */
export function subscribe(id: string, sub: Subscriber): () => void {
  start()
  subscribers.set(id, sub)

  const buffered = dataBuffer.get(id)
  if (buffered) {
    dataBuffer.delete(id)
    for (const chunk of buffered) sub.onData(chunk.data, chunk.replay === true)
  }
  const exited = exitBuffer.get(id)
  if (exited) {
    exitBuffer.delete(id)
    sub.onExit(exited)
  }

  return () => {
    if (subscribers.get(id) === sub) subscribers.delete(id)
  }
}
