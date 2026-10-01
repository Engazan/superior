import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import WebSocket, { WebSocketServer } from 'ws'

const MAX_MESSAGE = 256 * 1024
const MAX_BUFFERED = 2 * 1024 * 1024
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN = /^[A-Za-z0-9_-]{40,128}$/
const HASH = /^[a-f0-9]{64}$/

function hash(value) { return createHash('sha256').update(value).digest('hex') }
function equal(a, b) {
  if (!HASH.test(a) || !HASH.test(b)) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

export function createRelay({ dataFile, port = 8080, host = '127.0.0.1' }) {
  if (!dataFile) throw new Error('RELAY_DATA_FILE is required')
  let db = { hosts: {} }
  if (existsSync(dataFile)) {
    const loaded = JSON.parse(readFileSync(dataFile, 'utf8'))
    if (!loaded || typeof loaded.hosts !== 'object' || Array.isArray(loaded.hosts)) throw new Error('Invalid relay data file')
    db = loaded
  }
  const save = () => {
    mkdirSync(dirname(dataFile), { recursive: true, mode: 0o700 })
    const temp = `${dataFile}.${process.pid}.tmp`
    writeFileSync(temp, JSON.stringify(db), { mode: 0o600 })
    renameSync(temp, dataFile)
  }
  // Fail startup if the persistent volume is not writable, before health can
  // claim that a relay which cannot remember hosts is ready.
  save()

  const hosts = new Map()
  const phones = new Map()
  let registerAttempts = []
  const server = createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true }))
    } else { res.writeHead(404); res.end() }
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' || wss.clients.size >= 1024) { socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  function send(ws, message) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    if (ws.bufferedAmount > MAX_BUFFERED) { ws.close(1013, 'slow client'); return false }
    ws.send(JSON.stringify(message))
    return true
  }
  const fail = (ws, requestId, code) => send(ws, { t: 'error', requestId, code })

  wss.on('connection', (ws, req) => {
    let role = null
    let hostId = null
    let deviceId = null
    let alive = true
    let windowStart = Date.now()
    let messagesThisWindow = 0
    const authTimer = setTimeout(() => ws.close(1008, 'authentication timeout'), 10_000)
    ws.on('pong', () => { alive = true })
    ws.on('error', () => {})
    ws.on('close', () => {
      clearTimeout(authTimer)
      if (role === 'host' && hosts.get(hostId) === ws) {
        hosts.delete(hostId)
        for (const phone of phones.get(hostId)?.values() ?? []) send(phone, { t: 'host.offline' })
      }
      if (role === 'phone' && phones.get(hostId)?.get(deviceId) === ws) {
        phones.get(hostId).delete(deviceId)
        send(hosts.get(hostId), { t: 'peer.offline', deviceId })
      }
    })
    ws.on('message', (raw, binary) => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messagesThisWindow = 0 }
      if (++messagesThisWindow > 200) { ws.close(1008, 'message rate limit'); return }
      if (binary) { ws.close(1003, 'text only'); return }
      let msg
      try { msg = JSON.parse(raw.toString('utf8')) } catch { ws.close(1007, 'invalid JSON'); return }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.v !== 1 || typeof msg.t !== 'string') {
        ws.close(1008, 'invalid frame'); return
      }
      const requestId = typeof msg.requestId === 'string' && msg.requestId.length <= 80 ? msg.requestId : undefined
      if (!role) {
        if (msg.t === 'host.hello' && ID.test(msg.hostId) && TOKEN.test(msg.token)) {
          const existing = db.hosts[msg.hostId]
          if (!existing) {
            // Traefik makes remoteAddress its own IP for every user. A global
            // admission budget avoids that shared-IP false limit.
            registerAttempts = registerAttempts.filter((time) => Date.now() - time < 3_600_000)
            if (registerAttempts.length >= 100 || Object.keys(db.hosts).length >= 10_000) {
              ws.close(1008, 'registration limit'); return
            }
            registerAttempts.push(Date.now())
            db.hosts[msg.hostId] = { tokenHash: hash(msg.token), devices: {}, invites: {} }
            save()
          } else if (!equal(existing.tokenHash, hash(msg.token))) { ws.close(1008, 'authentication failed'); return }
          clearTimeout(authTimer)
          role = 'host'; hostId = msg.hostId
          hosts.get(hostId)?.close(1000, 'replaced')
          hosts.set(hostId, ws)
          send(ws, { v: 1, t: 'host.ready', devices: Object.keys(db.hosts[hostId].devices) })
          for (const [id] of phones.get(hostId) ?? []) send(ws, { t: 'peer.online', deviceId: id })
          for (const phone of phones.get(hostId)?.values() ?? []) send(phone, { t: 'host.online' })
          return
        }
        if (msg.t === 'phone.hello' && ID.test(msg.hostId) && ID.test(msg.deviceId) && TOKEN.test(msg.auth)) {
          const record = db.hosts[msg.hostId]
          const digest = hash(msg.auth)
          let device = record?.devices[msg.deviceId]
          if (!device) {
            const invite = record?.invites[msg.deviceId]
            if (!invite || invite.expiresAt < Date.now() || !equal(invite.authHash, digest)) {
              ws.close(1008, 'authentication failed'); return
            }
            device = { authHash: invite.authHash }
            record.devices[msg.deviceId] = device
            delete record.invites[msg.deviceId]
            save()
            send(hosts.get(msg.hostId), { t: 'peer.paired', deviceId: msg.deviceId })
          }
          if (!equal(device.authHash, digest)) { ws.close(1008, 'authentication failed'); return }
          clearTimeout(authTimer)
          role = 'phone'; hostId = msg.hostId; deviceId = msg.deviceId
          let peers = phones.get(hostId)
          if (!peers) { peers = new Map(); phones.set(hostId, peers) }
          peers.get(deviceId)?.close(1000, 'replaced')
          peers.set(deviceId, ws)
          send(ws, { v: 1, t: 'phone.ready', online: hosts.has(hostId) })
          send(hosts.get(hostId), { t: 'peer.online', deviceId })
          return
        }
        ws.close(1008, 'authentication required'); return
      }
      if (role === 'host') {
        const record = db.hosts[hostId]
        for (const [id, invite] of Object.entries(record.invites)) {
          if (invite.expiresAt < Date.now()) delete record.invites[id]
        }
        if (msg.t === 'host.invite' && ID.test(msg.deviceId) && HASH.test(msg.authHash) &&
            Number.isSafeInteger(msg.expiresAt) && msg.expiresAt > Date.now() && msg.expiresAt <= Date.now() + 600_000 &&
            Object.keys(record.devices).length < 20 && Object.keys(record.invites).length < 20 && !record.devices[msg.deviceId]) {
          record.invites[msg.deviceId] = { authHash: msg.authHash, expiresAt: msg.expiresAt }
          save(); send(ws, { t: 'ok', requestId }); return
        }
        if (msg.t === 'host.revoke' && ID.test(msg.deviceId)) {
          delete record.devices[msg.deviceId]
          delete record.invites[msg.deviceId]
          phones.get(hostId)?.get(msg.deviceId)?.close(1008, 'revoked')
          save(); send(ws, { t: 'ok', requestId }); return
        }
        if (msg.t === 'relay.data' && ID.test(msg.deviceId) && record.devices[msg.deviceId] &&
            typeof msg.payload === 'string' && msg.payload.length <= 180_000 && /^[A-Za-z0-9_-]+$/.test(msg.payload)) {
          if (!send(phones.get(hostId)?.get(msg.deviceId), { t: 'relay.data', payload: msg.payload })) fail(ws, requestId, 'device_offline')
          return
        }
      } else if (msg.t === 'relay.data' && db.hosts[hostId]?.devices[deviceId] &&
          typeof msg.payload === 'string' && msg.payload.length <= 180_000 && /^[A-Za-z0-9_-]+$/.test(msg.payload)) {
        if (!send(hosts.get(hostId), { t: 'relay.data', deviceId, payload: msg.payload })) fail(ws, requestId, 'host_offline')
        return
      }
      fail(ws, requestId, 'invalid_request')
    })
    ws._relayAlive = () => { if (!alive) ws.terminate(); else { alive = false; ws.ping() } }
  })
  const heartbeat = setInterval(() => { for (const ws of wss.clients) ws._relayAlive?.() }, 30_000)
  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => { server.off('error', reject); resolve() })
    }),
    close: () => new Promise((resolve) => {
      clearInterval(heartbeat)
      for (const ws of wss.clients) ws.terminate()
      wss.close(() => server.close(resolve))
    })
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const publicUrl = process.env.SUPERIOR_RELAY_PUBLIC_URL
  if (publicUrl && (new URL(publicUrl).protocol !== 'wss:' || new URL(publicUrl).pathname !== '/')) {
    throw new Error('SUPERIOR_RELAY_PUBLIC_URL must be a wss:// origin')
  }
  const relay = createRelay({
    dataFile: process.env.RELAY_DATA_FILE || './data/relay.json',
    port: Number(process.env.PORT || 8080),
    host: process.env.HOST || '127.0.0.1'
  })
  relay.listen().then(() => console.log(`Superior relay listening on ${process.env.PORT || 8080}`))
  process.on('SIGTERM', () => { void relay.close().then(() => process.exit(0)) })
}
