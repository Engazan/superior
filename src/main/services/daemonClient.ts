import { spawn } from 'child_process'
import * as net from 'net'
import { join } from 'path'
import { app, BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import {
  FrameDecoder,
  daemonSocketPath,
  encodeFrame,
  type ClientMessage,
  type DaemonSession,
  type DaemonSessionMeta,
  type ServerMessage
} from '@shared/daemon-protocol'

let sock: net.Socket | null = null
let connecting: Promise<net.Socket> | null = null

const pendingLists: Array<(list: DaemonSession[]) => void> = []
const pendingSpawns = new Map<string, (res: { pid?: number }) => void>()
// Compatibility with a daemon started by an older app build that does not yet
// tag attach snapshots as replay. The first data frame after attach is the
// synchronous scrollback snapshot (or harmlessly treated as one if empty).
const pendingReplay = new Set<string>()

function socketPath(): string {
  return daemonSocketPath(app.getPath('userData'))
}

function logPath(): string {
  return join(app.getPath('userData'), 'daemon.log')
}

function daemonEntry(): string {
  // out/main/daemon.js — resolves in dev and inside the asar in production.
  return join(app.getAppPath(), 'out', 'main', 'daemon.js')
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function onServerMessage(msg: ServerMessage): void {
  switch (msg.t) {
    case 'data': {
      const expectedReplay = pendingReplay.delete(msg.id)
      broadcast(IPC.AGENT_DATA, {
        id: msg.id,
        data: msg.data,
        replay: msg.replay === true || expectedReplay
      })
      break
    }
    case 'exit': {
      const message =
        msg.exitCode === 127
          ? 'command not found. Is it installed and on your PATH?'
          : undefined
      broadcast(IPC.AGENT_EXIT, { id: msg.id, exitCode: msg.exitCode, message })
      break
    }
    case 'sessions':
      pendingLists.shift()?.(msg.list)
      break
    case 'spawned': {
      const resolve = pendingSpawns.get(msg.id)
      if (resolve) {
        resolve({ pid: msg.pid })
        pendingSpawns.delete(msg.id)
      }
      break
    }
    case 'error':
      if (msg.id && pendingSpawns.has(msg.id)) {
        pendingSpawns.get(msg.id)?.({})
        pendingSpawns.delete(msg.id)
      }
      break
  }
}

function setupSocket(s: net.Socket): void {
  const decoder = new FrameDecoder<ServerMessage>()
  s.on('data', (chunk) => {
    for (const msg of decoder.push(chunk)) onServerMessage(msg)
  })
  s.on('close', () => {
    if (sock === s) sock = null
  })
  s.on('error', () => {
    /* surfaced via close */
  })
  s.write(encodeFrame({ t: 'hello' }))
}

function tryConnect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.connect(socketPath())
    s.once('connect', () => resolve(s))
    s.once('error', reject)
  })
}

function spawnDaemon(): void {
  const child = spawn(process.execPath, [daemonEntry(), socketPath(), logPath()], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function connectOrSpawn(): Promise<net.Socket> {
  try {
    return await tryConnect()
  } catch {
    spawnDaemon()
    for (let i = 0; i < 20; i++) {
      await delay(Math.min(50 + i * 30, 500))
      try {
        return await tryConnect()
      } catch {
        /* keep retrying */
      }
    }
    throw new Error('Terminal daemon is unavailable.')
  }
}

async function ensureDaemon(): Promise<net.Socket> {
  if (sock && !sock.destroyed) return sock
  if (!connecting) {
    connecting = connectOrSpawn()
      .then((s) => {
        setupSocket(s)
        sock = s
        return s
      })
      .finally(() => {
        connecting = null
      })
  }
  return connecting
}

async function send(msg: ClientMessage): Promise<void> {
  const s = await ensureDaemon()
  s.write(encodeFrame(msg))
}

export const daemonClient = {
  ensure: ensureDaemon,

  async spawn(payload: {
    id: string
    command: string
    cwd: string
    cols: number
    rows: number
    meta: DaemonSessionMeta
  }): Promise<{ pid?: number }> {
    const s = await ensureDaemon()
    const result = new Promise<{ pid?: number }>((resolve) =>
      pendingSpawns.set(payload.id, resolve)
    )
    s.write(encodeFrame({ t: 'spawn', ...payload }))
    return result
  },

  async list(): Promise<DaemonSession[]> {
    const s = await ensureDaemon()
    const result = new Promise<DaemonSession[]>((resolve) => pendingLists.push(resolve))
    s.write(encodeFrame({ t: 'list' }))
    return result
  },

  attach(id: string): void {
    pendingReplay.add(id)
    void send({ t: 'attach', id })
  },
  detach(id: string): void {
    void send({ t: 'detach', id })
  },
  input(id: string, data: string): void {
    void send({ t: 'input', id, data })
  },
  resize(id: string, cols: number, rows: number): void {
    void send({ t: 'resize', id, cols, rows })
  },
  kill(id: string): void {
    void send({ t: 'kill', id })
  },

  /** Drop the connection without killing sessions (used on app quit). */
  disconnect(): void {
    if (sock) {
      sock.destroy()
      sock = null
    }
  }
}
