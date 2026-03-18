import * as net from 'net'
import * as fs from 'fs'
import * as pty from 'node-pty'
import {
  FrameDecoder,
  encodeFrame,
  type ClientMessage,
  type DaemonSession,
  type DaemonSessionMeta,
  type ServerMessage
} from '@shared/daemon-protocol'
import { RingBuffer } from './ringBuffer'

// argv: [node, daemonEntry, socketPath, logPath]
const socketPath = process.argv[2]
const logPath = process.argv[3]

const SCROLLBACK_BYTES = 1_500_000
const SHUTDOWN_GRACE_MS = 45_000
const LOG_CAP_BYTES = 1_000_000

function log(msg: string): void {
  if (!logPath) return
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {
    /* logging must never throw */
  }
}

// Truncate an oversized log on startup.
try {
  if (logPath && fs.statSync(logPath).size > LOG_CAP_BYTES) fs.truncateSync(logPath)
} catch {
  /* no log yet */
}

interface Session {
  id: string
  proc: pty.IPty
  buffer: RingBuffer
  meta: DaemonSessionMeta
  cols: number
  rows: number
  attached: Set<Conn>
}

interface Conn {
  socket: net.Socket
  decoder: FrameDecoder<ClientMessage>
  attached: Set<string>
}

const sessions = new Map<string, Session>()
const clients = new Set<Conn>()
let shutdownTimer: NodeJS.Timeout | null = null

function send(conn: Conn, msg: ServerMessage): void {
  try {
    conn.socket.write(encodeFrame(msg))
  } catch {
    /* socket may have closed mid-write */
  }
}

function broadcast(session: Session, msg: ServerMessage): void {
  for (const conn of session.attached) send(conn, msg)
}

/** Clean env for spawned ptys — never leak Electron-as-Node flags to children. */
function ptyEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (k.startsWith('ELECTRON_')) continue
    env[k] = v
  }
  // Launched from the GUI there's no TERM/COLORTERM, so programs fall back to a
  // dumb terminal and drop colors. Advertise a modern 256/true-colour terminal
  // (xterm.js renders all of these) so CLIs emit full colour.
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  return env
}

function spawnSession(
  id: string,
  command: string,
  cwd: string,
  cols: number,
  rows: number,
  meta: DaemonSessionMeta
): void {
  if (sessions.has(id)) return
  const shell = process.env.SHELL || '/bin/zsh'
  const proc = pty.spawn(shell, ['-l', '-c', command], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd,
    env: ptyEnv()
  })

  const session: Session = {
    id,
    proc,
    buffer: new RingBuffer(SCROLLBACK_BYTES),
    meta,
    cols: cols || 80,
    rows: rows || 24,
    attached: new Set()
  }
  sessions.set(id, session)

  proc.onData((data) => {
    session.buffer.push(data)
    broadcast(session, { t: 'data', id, data })
  })
  proc.onExit(({ exitCode, signal }) => {
    broadcast(session, { t: 'exit', id, exitCode, signal })
    sessions.delete(id)
    scheduleShutdownCheck()
  })

  log(`spawned ${id} pid=${proc.pid} cmd=${command}`)
}

function listSessions(): DaemonSession[] {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    meta: s.meta,
    pid: s.proc.pid,
    cols: s.cols,
    rows: s.rows,
    status: 'running' as const
  }))
}

function handle(conn: Conn, msg: ClientMessage): void {
  switch (msg.t) {
    case 'hello':
      cancelShutdown()
      break
    case 'list':
      send(conn, { t: 'sessions', list: listSessions() })
      break
    case 'spawn':
      cancelShutdown()
      spawnSession(msg.id, msg.command, msg.cwd, msg.cols, msg.rows, msg.meta)
      send(conn, { t: 'spawned', id: msg.id, pid: sessions.get(msg.id)?.proc.pid })
      break
    case 'attach': {
      const s = sessions.get(msg.id)
      if (!s) {
        send(conn, { t: 'error', id: msg.id, message: 'no such session' })
        break
      }
      // Idempotent: only replay scrollback on the first attach for this conn.
      if (!conn.attached.has(msg.id)) {
        const snap = s.buffer.snapshot()
        if (snap) send(conn, { t: 'data', id: msg.id, data: snap, replay: true })
        conn.attached.add(msg.id)
        s.attached.add(conn)
      }
      break
    }
    case 'detach': {
      const s = sessions.get(msg.id)
      if (s) s.attached.delete(conn)
      conn.attached.delete(msg.id)
      break
    }
    case 'input':
      sessions.get(msg.id)?.proc.write(msg.data)
      break
    case 'resize': {
      const s = sessions.get(msg.id)
      if (!s) break
      s.cols = Math.max(msg.cols, 1)
      s.rows = Math.max(msg.rows, 1)
      try {
        s.proc.resize(s.cols, s.rows)
      } catch {
        /* resizing a just-exited pty can throw */
      }
      break
    }
    case 'kill':
      try {
        sessions.get(msg.id)?.proc.kill()
      } catch {
        /* already gone */
      }
      break
  }
}

function onConnection(socket: net.Socket): void {
  cancelShutdown()
  const conn: Conn = { socket, decoder: new FrameDecoder<ClientMessage>(), attached: new Set() }
  clients.add(conn)

  socket.on('data', (chunk) => {
    try {
      for (const msg of conn.decoder.push(chunk)) handle(conn, msg)
    } catch (err) {
      log(`handler error: ${(err as Error).stack ?? err}`)
    }
  })
  const cleanup = (): void => {
    for (const id of conn.attached) sessions.get(id)?.attached.delete(conn)
    clients.delete(conn)
    scheduleShutdownCheck()
  }
  socket.on('close', cleanup)
  socket.on('error', cleanup)
}

function cancelShutdown(): void {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer)
    shutdownTimer = null
  }
}

/** Exit only when there are no sessions and no connected clients. */
function scheduleShutdownCheck(): void {
  if (sessions.size > 0 || clients.size > 0) return
  cancelShutdown()
  shutdownTimer = setTimeout(() => {
    if (sessions.size === 0 && clients.size === 0) {
      log('idle — shutting down')
      cleanupSocket()
      process.exit(0)
    }
  }, SHUTDOWN_GRACE_MS)
  shutdownTimer.unref()
}

function cleanupSocket(): void {
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(socketPath)
    } catch {
      /* already gone */
    }
  }
}

function start(): void {
  const server = net.createServer(onConnection)

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Either a live daemon already owns the socket, or it's a stale file.
      const probe = net.connect(socketPath)
      probe.on('connect', () => {
        probe.destroy()
        log('another daemon is alive — exiting')
        process.exit(0)
      })
      probe.on('error', () => {
        // Stale socket: remove and retry once.
        cleanupSocket()
        try {
          server.listen(socketPath)
        } catch (e) {
          log(`relisten failed: ${e}`)
          process.exit(1)
        }
      })
      return
    }
    log(`server error: ${err.stack ?? err}`)
    process.exit(1)
  })

  server.listen(socketPath, () => log(`listening on ${socketPath}`))
}

// A daemon crash kills every pty — survive non-fatal errors.
process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack ?? err}`))
process.on('unhandledRejection', (reason) => log(`unhandledRejection: ${reason}`))
process.on('SIGHUP', () => {
  /* ignore — outliving the app is the whole point */
})

start()
