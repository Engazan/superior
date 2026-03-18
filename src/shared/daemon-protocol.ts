import type { AgentStatus, PresetIconType } from './types'

/** Metadata the app needs to rebuild a session's UI after a restart. */
export interface DaemonSessionMeta {
  label: string
  iconType?: PresetIconType
  icon?: string
  command: string
  workspaceId: string
  createdAt: number
}

/** A session as reported by the daemon's `list`. */
export interface DaemonSession {
  id: string
  meta: DaemonSessionMeta
  pid?: number
  cols: number
  rows: number
  status: AgentStatus
  exitCode?: number
}

/** Messages a client (the Electron main process) sends to the daemon. */
export type ClientMessage =
  | { t: 'hello' }
  | { t: 'list' }
  | {
      t: 'spawn'
      id: string
      command: string
      cwd: string
      cols: number
      rows: number
      meta: DaemonSessionMeta
    }
  | { t: 'attach'; id: string }
  | { t: 'detach'; id: string }
  | { t: 'input'; id: string; data: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'kill'; id: string }

/** Messages the daemon sends back to a client. */
export type ServerMessage =
  | { t: 'data'; id: string; data: string; replay?: boolean }
  | { t: 'exit'; id: string; exitCode: number; signal?: number }
  | { t: 'sessions'; list: DaemonSession[] }
  | { t: 'spawned'; id: string; pid?: number }
  | { t: 'error'; message: string; id?: string }

/** Default socket / pipe path for the daemon. */
export function daemonSocketPath(userData: string): string {
  if (process.platform === 'win32') {
    // Named pipes are namespaced, not files; derive a stable name from userData.
    const hash = Buffer.from(userData).toString('hex').slice(0, 16)
    return `\\\\.\\pipe\\superior-daemon-${hash}`
  }
  return `${userData}/daemon.sock`
}

/** Encode a message as a length-prefixed (4-byte BE) JSON frame. */
export function encodeFrame(msg: ClientMessage | ServerMessage): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8')
  const head = Buffer.allocUnsafe(4)
  head.writeUInt32BE(json.length, 0)
  return Buffer.concat([head, json])
}

/** Accumulates socket chunks and yields complete decoded frames. */
export class FrameDecoder<T extends ClientMessage | ServerMessage> {
  private buf: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): T[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    const out: T[] = []
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0)
      if (this.buf.length < 4 + len) break
      const json = this.buf.subarray(4, 4 + len).toString('utf8')
      this.buf = this.buf.subarray(4 + len)
      try {
        out.push(JSON.parse(json) as T)
      } catch {
        /* skip malformed frame */
      }
    }
    return out
  }
}
