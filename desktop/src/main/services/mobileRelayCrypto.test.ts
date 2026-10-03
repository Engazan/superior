import { describe, expect, it } from 'vitest'
import { randomBytes, randomUUID } from 'crypto'
import { decryptMobile, encryptMobile, mobileAuth, mobileAuthHash } from './mobileRelayCrypto'

describe('mobile relay encryption', () => {
  const master = randomBytes(32).toString('base64url')
  const hostId = randomUUID()
  const deviceId = randomUUID()

  it('keeps relay authentication separate from the encrypted channel', () => {
    const auth = mobileAuth(master, hostId, deviceId)
    expect(auth).not.toBe(master)
    expect(mobileAuthHash(auth)).toMatch(/^[a-f0-9]{64}$/)
    expect(mobileAuth(master, hostId, randomUUID())).not.toBe(auth)
  })

  it('round trips only for the paired device and correct direction', () => {
    const payload = { v: 1, type: 'terminal.input', sessionId: randomUUID(), data: 'yes\r' }
    const packet = encryptMobile(payload, master, hostId, deviceId, 'phone-to-host')
    expect(decryptMobile(packet, master, hostId, deviceId, 'phone-to-host')).toEqual(payload)
    expect(() => decryptMobile(packet, master, hostId, deviceId, 'host-to-phone')).toThrow()
    expect(() => decryptMobile(packet, master, hostId, randomUUID(), 'phone-to-host')).toThrow()
    const bytes = Buffer.from(packet, 'base64url')
    bytes[bytes.length - 1] ^= 1
    expect(() => decryptMobile(bytes.toString('base64url'), master, hostId, deviceId, 'phone-to-host')).toThrow()
  })
})
