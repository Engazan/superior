import { createDecipheriv, createCipheriv, hkdfSync, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import WebSocket from 'ws'

const file = process.argv[2]
if (!file) {
  console.error('Usage: npm run smoke:phone -- /path/to/private-pairing.json')
  process.exit(2)
}
const pairing = JSON.parse(readFileSync(file, 'utf8'))
const { url, hostId, deviceId, master } = pairing
if (pairing.v !== 1 || !url || !hostId || !deviceId || !master) throw new Error('Invalid pairing data')
const salt = Buffer.from(`${hostId}:${deviceId}`)
const derive = (info) => Buffer.from(hkdfSync('sha256', Buffer.from(master, 'base64url'), salt, info, 32))
const auth = derive('superior-relay-auth-v1').toString('base64url')
const key = derive('superior-mobile-e2ee-v1')
const sequenceFile = `${file}.seq`
let seq = 0
try { seq = Number(readFileSync(sequenceFile, 'utf8')) || 0 } catch { /* first run */ }
const endpoint = new URL(url)
endpoint.pathname = '/ws'
const ws = new WebSocket(endpoint)
const input = createInterface({ input: process.stdin })
let sessionId = null

function encrypt(value) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(`superior:v1:${hostId}:${deviceId}:phone-to-host`))
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url')
}
function decrypt(packet) {
  const bytes = Buffer.from(packet, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(`superior:v1:${hostId}:${deviceId}:host-to-phone`))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'))
}
function send(type, fields = {}) {
  seq++
  writeFileSync(sequenceFile, String(seq), { mode: 0o600 })
  ws.send(JSON.stringify({ v: 1, t: 'relay.data', payload: encrypt({ v: 1, type, seq, requestId: randomUUID(), ...fields }) }))
}

ws.on('open', () => ws.send(JSON.stringify({ v: 1, t: 'phone.hello', hostId, deviceId, auth })))
ws.on('message', (raw) => {
  const outer = JSON.parse(raw.toString())
  if (outer.t === 'phone.ready') {
    if (!outer.online) console.error('Desktop offline; waiting for it to connect.')
    else send('sessions.list')
  } else if (outer.t === 'host.online') send('sessions.list')
  else if (outer.t === 'relay.data') {
    const msg = decrypt(outer.payload)
    if (msg.type === 'sessions') {
      console.error('Running sessions:', msg.list.map((s) => `${s.id} ${s.label}`).join(', ') || '(none)')
      sessionId = msg.list[0]?.id ?? null
      if (sessionId) send('terminal.subscribe', { sessionId })
    } else if (msg.type === 'terminal.snapshot' || msg.type === 'terminal.data') {
      process.stdout.write(msg.data)
    } else if (msg.type === 'error') console.error('Desktop error:', msg.code)
    else if (msg.type === 'session.exit') console.error('Session exited:', msg.exitCode)
  } else if (outer.t === 'error') console.error('Relay error:', outer.code)
  else if (outer.t === 'host.offline') console.error('Desktop offline.')
})
ws.on('close', (code) => { console.error('Relay closed:', code); input.close() })
ws.on('error', (err) => console.error('Connection error:', err.message))
input.on('line', (line) => {
  if (sessionId && ws.readyState === WebSocket.OPEN) send('terminal.input', { sessionId, data: `${line}\r` })
})
