import * as net from 'net'
import * as fs from 'fs'
import * as pty from 'node-pty'
import {
  FrameDecoder,
  encodeDataFrame,
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
// Max chunk size when forwarding input to a pty; a larger paste is split into
// chunks of this size rather than handed over — or dropped — in one frame.
const MAX_INPUT_BYTES = 1_000_000
// node-pty emits many small reads per frame; coalesce them so a fast producer
// (`cat` of a big file) becomes a few large frames per tick instead of
// thousands of tiny socket writes + IPC messages.
const FLUSH_MS = 8
const FLUSH_THRESHOLD_BYTES = 65_536

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
  /** Output accumulated since the last flush (also already in `buffer`). */
  pending: string
  flushTimer: NodeJS.Timeout | null
}

interface Conn {
  socket: net.Socket
  decoder: FrameDecoder<ClientMessage>
  attached: Set<string>
  /** Sessions paused because this conn's socket buffer backed up. */
  pausedSessions: Set<Session>
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

/**
 * Write a data frame with backpressure: when the socket can't drain as fast as
 * the pty produces, pause the pty until the socket's 'drain' — otherwise a
 * `cat` of a huge file grows the kernel/renderer buffers without bound.
 */
function sendData(conn: Conn, session: Session, frame: Buffer): void {
  try {
    if (!conn.socket.write(frame) && !conn.pausedSessions.has(session)) {
      conn.pausedSessions.add(session)
      try {
        session.proc.pause()
      } catch {
        /* pty may have just exited */
      }
    }
  } catch {
    /* socket may have closed mid-write */
  }
}

/** Resume a session unless another conn still has it backpressured. */
function maybeResume(session: Session): void {
  for (const conn of session.attached) {
    if (conn.pausedSessions.has(session)) return
  }
  try {
    session.proc.resume()
  } catch {
    /* pty may have just exited */
  }
}

/** Flush a session's coalesced output to every attached client as one frame. */
function flush(session: Session): void {
  if (session.flushTimer) {
    clearTimeout(session.flushTimer)
    session.flushTimer = null
  }
  if (!session.pending) return
  const frame = encodeDataFrame(session.id, session.pending)
  session.pending = ''
  for (const conn of session.attached) sendData(conn, session, frame)
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

/**
 * Pick the shell + args to run `command` (or, when empty, a plain interactive
 * shell) on the host platform.
 *  - POSIX: a login shell so the user's real PATH (nvm, ~/.local/bin, …) is
 *    available even when the app is launched from a GUI; `-l -c` for a command,
 *    `-l -i` for an interactive terminal. Falls back to bash/sh (never zsh,
 *    which many Linux installs lack) when $SHELL is unset.
 *  - Windows: COMSPEC (cmd.exe) with `/c` for a command, or PowerShell for a
 *    plain interactive terminal. The `-l` family of flags is POSIX-only.
 */
function resolveShell(command: string): { shell: string; shellArgs: string[] } {
  const hasCommand = command.trim().length > 0
  if (process.platform === 'win32') {
    if (hasCommand) {
      const shell = process.env.COMSPEC || 'cmd.exe'
      return { shell, shellArgs: ['/d', '/s', '/c', command] }
    }
    return { shell: 'powershell.exe', shellArgs: ['-NoLogo'] }
  }
  const shell = process.env.SHELL || '/bin/bash'
  return { shell, shellArgs: hasCommand ? ['-l', '-c', command] : ['-l', '-i'] }
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
  const { shell, shellArgs } = resolveShell(command)
  const proc = pty.spawn(shell, shellArgs, {
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
    attached: new Set(),
    pending: '',
    flushTimer: null
  }
  sessions.set(id, session)

  proc.onData((data) => {
    session.buffer.push(data)
    session.pending += data
    if (session.pending.length >= FLUSH_THRESHOLD_BYTES) {
      flush(session)
    } else if (!session.flushTimer) {
      session.flushTimer = setTimeout(() => flush(session), FLUSH_MS)
    }
  })
  proc.onExit(({ exitCode, signal }) => {
    flush(session) // the last output must land before the exit notice
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
        flush(s) // pending bytes are already in the snapshot; don't send them twice
        const snap = s.buffer.snapshot()
        if (snap) {
          try {
            conn.socket.write(encodeDataFrame(msg.id, snap, true))
          } catch {
            /* socket may have closed mid-write */
          }
        }
        conn.attached.add(msg.id)
        s.attached.add(conn)
      }
      break
    }
    case 'detach': {
      const s = sessions.get(msg.id)
      if (s) {
        s.attached.delete(conn)
        if (conn.pausedSessions.delete(s)) maybeResume(s)
      }
      conn.attached.delete(msg.id)
      break
    }
    case 'input': {
      const s = sessions.get(msg.id)
      if (!s) break
      const data = msg.data
      if (data.length <= MAX_INPUT_BYTES) {
        s.proc.write(data)
        break
      }
      // Deliver a large paste in bounded chunks rather than dropping it, so input
      // is never silently lost. Cut on a safe boundary (don't split a surrogate pair).
      let i = 0
      while (i < data.length) {
        let end = Math.min(i + MAX_INPUT_BYTES, data.length)
        if (end < data.length) {
          const code = data.charCodeAt(end - 1)
          if (code >= 0xd800 && code <= 0xdbff) end -= 1 // keep the pair together
        }
        s.proc.write(data.slice(i, end))
        i = end
      }
      log(`chunked oversized input for ${msg.id} (${data.length} chars)`)
      break
    }
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
  const conn: Conn = {
    socket,
    decoder: new FrameDecoder<ClientMessage>(),
    attached: new Set(),
    pausedSessions: new Set()
  }
  clients.add(conn)

  socket.on('data', (chunk) => {
    try {
      for (const msg of conn.decoder.push(chunk)) handle(conn, msg)
    } catch (err) {
      log(`handler error: ${(err as Error).stack ?? err}`)
    }
  })
  socket.on('drain', () => {
    const paused = [...conn.pausedSessions]
    conn.pausedSessions.clear()
    for (const s of paused) maybeResume(s)
  })
  const cleanup = (): void => {
    for (const id of conn.attached) sessions.get(id)?.attached.delete(conn)
    const paused = [...conn.pausedSessions]
    conn.pausedSessions.clear()
    for (const s of paused) maybeResume(s)
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
