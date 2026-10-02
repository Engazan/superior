import { handleMobileBridge } from './mobileRelayBridge'
import { randomBytes, randomUUID } from 'crypto'
import type { ServerMessage } from '@shared/daemon-protocol'
import { DEFAULT_MOBILE_RELAY, type MobileRelayInvite, type MobileRelayStatus } from '@shared/mobileRelay'
import { daemonClient } from './daemonClient'
import { getAgentStates } from './agent-state.service'
import { listWorkspaces } from './workspace.service'
import { MobileRelayDaemon } from './mobileRelayDaemon'
import { decryptMobile, encryptMobile, mobileAuth, mobileAuthHash } from './mobileRelayCrypto'
import { readMobileRelayConfig, writeMobileRelayConfig, type MobileDevice, type MobileRelayConfig } from './mobileRelayStore'

declare const __SUPERIOR_RELAY_URL__: string

// Read userData only after app.whenReady() and app.setName('Superior').
let config: MobileRelayConfig
let socket: WebSocket | null = null
let connected = false
let lastError = ''
let retryTimer: NodeJS.Timeout | null = null
let authTimer: NodeJS.Timeout | null = null
let retryDelay = 1_000
let generation = 0
const streams = new Map<string, MobileRelayDaemon>()
const sequences = new Map<string, Map<string, number>>()
const outbound = new Map<string, Promise<void>>()
const outboundCount = new Map<string, number>()
const deviceEpoch = new Map<string, number>()
const pending = new Map<string, { resolve: () => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>()
const queues = new Map<string, Promise<void>>()

function effectiveUrl(): string {
  return config.url || process.env.SUPERIOR_RELAY_URL || __SUPERIOR_RELAY_URL__ || DEFAULT_MOBILE_RELAY
}

function socketUrl(value: string): string {
  const parsed = new URL(value)
  const localDev = parsed.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if ((!localDev && parsed.protocol !== 'wss:') || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Relay URL must be a wss:// origin without a path or credentials.')
  }
  parsed.pathname = '/ws'
  return parsed.toString()
}

function send(frame: unknown): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 2_000_000) throw new Error('Relay unavailable or congested.')
  socket.send(JSON.stringify({ v: 1, ...frame as object }))
}

function request(frame: object): Promise<void> {
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Relay did not answer.')) }, 5_000)
    pending.set(requestId, { resolve, reject, timer })
    try { send({ ...frame, requestId }) } catch (err) { clearTimeout(timer); pending.delete(requestId); reject(err) }
  })
}

function device(id: string): MobileDevice | undefined { return config.devices.find((d) => d.id === id) }

function encrypted(id: string, payload: unknown): void {
  const current = device(id)
  if (!current) return
  send({ t: 'relay.data', deviceId: id, payload: encryptMobile(payload, current.master, config.hostId, id, 'host-to-phone') })
}

function dropStream(id: string): void {
  streams.get(id)?.close()
  streams.delete(id)
  sequences.delete(id)
  deviceEpoch.set(id, (deviceEpoch.get(id) ?? 0) + 1)
  outbound.delete(id)
  outboundCount.delete(id)
}

function queueEncrypted(id: string, payload: unknown): void {
  if (!streams.has(id)) return
  const queuedGeneration = generation
  const queuedEpoch = deviceEpoch.get(id) ?? 0
  const count = (outboundCount.get(id) ?? 0) + 1
  if (count > 256) {
    dropStream(id)
    return
  }
  outboundCount.set(id, count)
  const previous = outbound.get(id) ?? Promise.resolve()
  const next = previous.then(async () => {
    const deadline = Date.now() + 10_000
    while (socket && socket.readyState === WebSocket.OPEN && socket.bufferedAmount > 256_000) {
      if (Date.now() > deadline) throw new Error('Slow relay connection')
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    if (queuedGeneration !== generation || queuedEpoch !== (deviceEpoch.get(id) ?? 0)) throw new Error('Stale connection')
    encrypted(id, payload)
  }).catch(() => {
    if (queuedGeneration !== generation || queuedEpoch !== (deviceEpoch.get(id) ?? 0)) return
    dropStream(id)
  }).finally(() => {
    if (queuedGeneration === generation && queuedEpoch === (deviceEpoch.get(id) ?? 0)) {
      outboundCount.set(id, Math.max(0, (outboundCount.get(id) ?? 1) - 1))
    }
  })
  outbound.set(id, next)
}

function outputChunks(value: string): string[] {
  if (!value) return ['']
  const chunks: string[] = []
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 20_000, value.length)
    if (end < value.length) {
      const last = value.charCodeAt(end - 1)
      if (last >= 0xd800 && last <= 0xdbff) end--
    }
    chunks.push(value.slice(start, end))
    start = end
  }
  return chunks
}

function output(id: string, msg: ServerMessage): void {
  try {
    if (msg.t === 'data') {
      const chunks = outputChunks(msg.data)
      let bySession = sequences.get(id)
      if (!bySession) { bySession = new Map(); sequences.set(id, bySession) }
      if (msg.replay) bySession.set(msg.id, 0)
      for (const [part, data] of chunks.entries()) {
        const seq = bySession.get(msg.id) ?? 0
        bySession.set(msg.id, seq + 1)
        queueEncrypted(id, { v: 1, type: msg.replay ? 'terminal.snapshot' : 'terminal.data', sessionId: msg.id, data, seq, part, last: part === chunks.length - 1 })
      }
    } else if (msg.t === 'exit') {
      queueEncrypted(id, { v: 1, type: 'session.exit', sessionId: msg.id, exitCode: msg.exitCode })
    } else if (msg.t === 'error' && msg.id) {
      queueEncrypted(id, { v: 1, type: 'error', sessionId: msg.id, code: msg.message })
    }
  } catch {
    dropStream(id)
  }
}

async function handlePhone(id: string, raw: unknown): Promise<void> {
  const current = device(id)
  if (!config.enabled || !current || !raw || typeof raw !== 'object' || Array.isArray(raw)) return
  const msg = raw as Record<string, unknown>
  if (msg.v !== 1 || typeof msg.type !== 'string') return
  const requestId = typeof msg.requestId === 'string' && msg.requestId.length <= 80 ? msg.requestId : undefined
  const answer = (body: object): void => encrypted(id, { v: 1, requestId, ...body })
  try {
    const bridged = await handleMobileBridge(id, msg, () => config.enabled && device(id) === current)
    if (bridged) { answer(bridged); return }
    if (msg.type === 'workspaces.list') {
      answer({ type: 'workspaces', list: listWorkspaces().workspaces.slice(0, 500).map((w) => ({ id: w.id, name: w.name.slice(0, 128) })) })
      return
    }
    if (msg.type === 'sessions.list') {
      const list = await daemonClient.list()
      const states = new Map(getAgentStates().map((state) => [state.id, state.state]))
      answer({ type: 'sessions', list: list.filter((s) => !msg.workspaceId || s.meta.workspaceId === msg.workspaceId).slice(0, 500).map((s) => ({
        id: s.id, workspaceId: s.meta.workspaceId, label: s.meta.label.slice(0, 128), nickname: s.meta.nickname?.slice(0, 128),
        cols: s.cols, rows: s.rows, createdAt: s.meta.createdAt, status: s.status,
        agentState: states.get(s.id) ?? 'unknown'
      })) })
      return
    }
    if (!['terminal.subscribe', 'terminal.unsubscribe', 'terminal.input'].includes(msg.type)) throw new Error('unsupported_action')
    if (typeof msg.sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(msg.sessionId)) throw new Error('invalid_session')
    const sessionId = msg.sessionId
    if (msg.type === 'terminal.unsubscribe') {
      streams.get(id)?.unsubscribe(sessionId)
      answer({ type: 'ok' }); return
    }
    const live = (await daemonClient.list()).some((s) => s.id === sessionId)
    if (!config.enabled || device(id) !== current) throw new Error('device_revoked')
    if (!live) throw new Error('session_not_running')
    if (msg.type === 'terminal.subscribe') {
      let stream = streams.get(id)
      if (stream && !stream.isConnected()) { stream.close(); streams.delete(id); stream = undefined }
      if (!stream) {
        stream = new MobileRelayDaemon((event) => output(id, event))
        await stream.connect()
        if (!config.enabled || device(id) !== current) { stream.close(); throw new Error('device_revoked') }
        streams.set(id, stream)
      }
      sequences.get(id)?.delete(sessionId)
      stream.subscribe(sessionId)
      answer({ type: 'ok' }); return
    }
    if (msg.type === 'terminal.input') {
      if (!requestId || typeof msg.data !== 'string' || Buffer.byteLength(msg.data, 'utf8') > 8192) throw new Error('invalid_input')
      if (current.processedInputs.includes(requestId)) throw new Error('duplicate_input')
      // Persist the request ID before writing. A lost acknowledgement must not
      // cause an automatic retry to execute the input twice.
      current.processedInputs.push(requestId)
      current.processedInputs = current.processedInputs.slice(-256)
      writeMobileRelayConfig(config)
      await daemonClient.inputChecked(sessionId, msg.data)
      answer({ type: 'ok' }); return
    }
    throw new Error('unsupported_action')
  } catch (err) {
    answer({ type: 'error', code: (err as Error).message.replace(/[^a-z_]/g, '') || 'failed' })
  }
}

function onMessage(data: unknown): void {
  let msg: Record<string, unknown>
  try { msg = JSON.parse(String(data)) as Record<string, unknown> } catch { return }
  if (!msg || typeof msg.t !== 'string') return
  if (msg.t === 'host.ready') {
    if (authTimer) clearTimeout(authTimer)
    authTimer = null
    connected = true; lastError = ''; retryDelay = 1_000
    if (Array.isArray(msg.devices)) {
      const paired = new Set(msg.devices.filter((id): id is string => typeof id === 'string'))
      for (const current of config.devices) current.paired = paired.has(current.id)
      writeMobileRelayConfig(config)
    }
    return
  }
  if (msg.t === 'ok' || msg.t === 'error') {
    const entry = pending.get(String(msg.requestId))
    if (entry) {
      clearTimeout(entry.timer); pending.delete(String(msg.requestId))
      if (msg.t === 'ok') entry.resolve()
      else entry.reject(new Error(String(msg.code || 'Relay rejected request.')))
    }
    return
  }
  if (msg.t === 'peer.paired' && typeof msg.deviceId === 'string') {
    const current = device(msg.deviceId)
    if (current) { current.paired = true; writeMobileRelayConfig(config) }
  }
  if (msg.t === 'peer.offline' && typeof msg.deviceId === 'string') {
    dropStream(msg.deviceId)
  }
  if (msg.t === 'relay.data' && typeof msg.deviceId === 'string' && typeof msg.payload === 'string') {
    const current = device(msg.deviceId)
    if (!current) return
    const id = msg.deviceId
    const prior = queues.get(id) ?? Promise.resolve()
    const next = prior.then(async () => {
      const payload = decryptMobile(msg.payload as string, current.master, config.hostId, id, 'phone-to-host')
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return
      const seq = (payload as { seq?: unknown }).seq
      if (!Number.isSafeInteger(seq) || (seq as number) <= current.lastPhoneSeq) return
      current.lastPhoneSeq = seq as number
      writeMobileRelayConfig(config)
      if ((payload as { type?: string }).type === 'terminal.input') await handlePhone(id, payload)
      else void handlePhone(id, payload)
    }).catch(() => {})
    queues.set(id, next)
  }
}

function disconnect(): void {
  generation++
  connected = false
  if (authTimer) clearTimeout(authTimer)
  authTimer = null
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  try { socket?.close() } catch { /* may still be connecting */ }
  socket = null
  for (const stream of streams.values()) stream.close()
  streams.clear(); sequences.clear(); queues.clear()
  outbound.clear(); outboundCount.clear(); deviceEpoch.clear()
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Relay disconnected.')) }
  pending.clear()
}

function connect(): void {
  if (!config.enabled || socket) return
  let url: string
  try { url = socketUrl(effectiveUrl()) } catch (err) { lastError = (err as Error).message; return }
  const ws = new WebSocket(url)
  socket = ws
  authTimer = setTimeout(() => { if (socket === ws && !connected) ws.close() }, 10_000)
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ v: 1, t: 'host.hello', hostId: config.hostId, token: config.hostToken }))
  })
  ws.addEventListener('message', (event) => {
    try { onMessage(event.data) } catch { lastError = 'Relay message handling failed.'; ws.close() }
  })
  ws.addEventListener('error', () => { lastError = 'Relay connection failed.' })
  ws.addEventListener('close', () => {
    if (socket !== ws) return
    disconnect()
    if (config.enabled) {
      retryTimer = setTimeout(() => { retryTimer = null; connect() }, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 30_000)
    }
  })
}

export const mobileRelay = {
  start(): void { config = readMobileRelayConfig(); if (config.enabled) connect() },
  stop(): void { disconnect() },
  status(): MobileRelayStatus {
    return { enabled: config.enabled, connected, url: effectiveUrl(), hostId: config.hostId,
      error: lastError || undefined,
      devices: config.devices.map(({ id, createdAt, paired }) => ({ id, createdAt, paired })) }
  },
  setEnabled(enabled: boolean): MobileRelayStatus {
    config.enabled = enabled
    writeMobileRelayConfig(config)
    if (enabled) connect(); else disconnect()
    return this.status()
  },
  setUrl(value: string): MobileRelayStatus {
    if (value) socketUrl(value)
    config.url = value
    writeMobileRelayConfig(config)
    disconnect(); if (config.enabled) connect()
    return this.status()
  },
  async invite(): Promise<MobileRelayInvite> {
    if (!connected) throw new Error('Relay is not connected.')
    const id = randomUUID()
    const master = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + 5 * 60_000
    const authHash = mobileAuthHash(mobileAuth(master, config.hostId, id))
    await request({ t: 'host.invite', deviceId: id, authHash, expiresAt })
    config.devices.push({ id, master, createdAt: Date.now(), paired: false, processedInputs: [], lastPhoneSeq: 0 })
    writeMobileRelayConfig(config)
    return { deviceId: id, expiresAt, pairing: JSON.stringify({ v: 1, url: effectiveUrl(), hostId: config.hostId, deviceId: id, master }) }
  },
  async revoke(id: string): Promise<MobileRelayStatus> {
    if (!device(id)) throw new Error('Unknown device.')
    if (!connected) throw new Error('Relay is not connected.')
    await request({ t: 'host.revoke', deviceId: id })
    config.devices = config.devices.filter((d) => d.id !== id)
    writeMobileRelayConfig(config)
    dropStream(id)
    return this.status()
  }
}
