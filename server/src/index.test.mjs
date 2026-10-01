import assert from 'node:assert/strict'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import WebSocket from 'ws'
import { createRelay } from './index.mjs'

const token = () => randomBytes(32).toString('base64url')
const hash = (value) => createHash('sha256').update(value).digest('hex')
function inbox(ws) {
  const messages = [], waiting = []
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString())
    const next = waiting.shift()
    if (next) next(message)
    else messages.push(message)
  })
  return () => messages.length ? Promise.resolve(messages.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message timeout')), 1000)
    waiting.push((message) => { clearTimeout(timer); resolve(message) })
  })
}
const open = (url) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url)
  ws.once('open', () => resolve(ws))
  ws.once('error', reject)
})
const send = (ws, frame) => ws.send(JSON.stringify({ v: 1, ...frame }))

test('relay authenticates, routes opaque payloads, revokes and persists devices', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'superior-relay-'))
  const dataFile = join(dir, 'relay.json')
  let relay = createRelay({ dataFile, port: 0, host: '127.0.0.1' })
  try { await relay.listen() } catch (err) {
    await relay.close()
    rmSync(dir, { recursive: true, force: true })
    if (err.code === 'EPERM' && !process.env.CI) { t.skip('sandbox disallows listening sockets'); return }
    throw err
  }
  const url = `ws://127.0.0.1:${relay.server.address().port}/ws`
  const hostId = randomUUID(), deviceId = randomUUID(), hostToken = token(), auth = token()
  try {
    let host = await open(url)
    let hostNext = inbox(host)
    send(host, { t: 'host.hello', hostId, token: hostToken })
    assert.equal((await hostNext()).t, 'host.ready')
    const attacker = await open(url)
    const attackerClosed = new Promise((resolve) => attacker.once('close', resolve))
    send(attacker, { t: 'phone.hello', hostId, deviceId, auth })
    assert.equal(await attackerClosed, 1008)
    send(host, { t: 'host.invite', deviceId, authHash: hash(auth), expiresAt: Date.now() + 60_000, requestId: 'invite' })
    assert.deepEqual(await hostNext(), { t: 'ok', requestId: 'invite' })
    const phone = await open(url)
    const phoneNext = inbox(phone)
    send(phone, { t: 'phone.hello', hostId, deviceId, auth })
    assert.equal((await phoneNext()).t, 'phone.ready')
    assert.equal((await hostNext()).t, 'peer.paired')
    assert.equal((await hostNext()).t, 'peer.online')
    send(phone, { t: 'relay.data', payload: 'ZW5jcnlwdGVk' })
    assert.deepEqual(await hostNext(), { t: 'relay.data', deviceId, payload: 'ZW5jcnlwdGVk' })
    send(host, { t: 'relay.data', deviceId, payload: 'cmVwbHk' })
    assert.deepEqual(await phoneNext(), { t: 'relay.data', payload: 'cmVwbHk' })
    const otherHostId = randomUUID()
    const otherHost = await open(url)
    const otherNext = inbox(otherHost)
    send(otherHost, { t: 'host.hello', hostId: otherHostId, token: token() })
    assert.equal((await otherNext()).t, 'host.ready')
    send(otherHost, { t: 'relay.data', deviceId, payload: 'cmVwbHk', requestId: 'cross-tenant' })
    assert.deepEqual(await otherNext(), { t: 'error', requestId: 'cross-tenant', code: 'invalid_request' })
    const crossTenantPhone = await open(url)
    const crossTenantClosed = new Promise((resolve) => crossTenantPhone.once('close', resolve))
    send(crossTenantPhone, { t: 'phone.hello', hostId: otherHostId, deviceId, auth })
    assert.equal(await crossTenantClosed, 1008)
    const phoneClosed = new Promise((resolve) => phone.once('close', resolve))
    send(host, { t: 'host.revoke', deviceId, requestId: 'revoke' })
    assert.deepEqual(await hostNext(), { t: 'ok', requestId: 'revoke' })
    assert.equal(await phoneClosed, 1008)
    await relay.close()
    relay = createRelay({ dataFile, port: 0, host: '127.0.0.1' })
    await relay.listen()
    const url2 = `ws://127.0.0.1:${relay.server.address().port}/ws`
    host = await open(url2)
    hostNext = inbox(host)
    send(host, { t: 'host.hello', hostId, token: hostToken })
    assert.deepEqual((await hostNext()).devices, [])
    const revoked = await open(url2)
    const revokedClosed = new Promise((resolve) => revoked.once('close', resolve))
    send(revoked, { t: 'phone.hello', hostId, deviceId, auth })
    assert.equal(await revokedClosed, 1008)
  } finally {
    await relay.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
