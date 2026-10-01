import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'crypto'

export function mobileAuth(master: string, hostId: string, deviceId: string): string {
  const secret = Buffer.from(master, 'base64url')
  return Buffer.from(hkdfSync('sha256', secret, Buffer.from(`${hostId}:${deviceId}`), 'superior-relay-auth-v1', 32)).toString('base64url')
}

export function mobileAuthHash(auth: string): string {
  return createHash('sha256').update(auth).digest('hex')
}

function key(master: string, hostId: string, deviceId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(master, 'base64url'), Buffer.from(`${hostId}:${deviceId}`), 'superior-mobile-e2ee-v1', 32))
}

export function encryptMobile(payload: unknown, master: string, hostId: string, deviceId: string, direction: 'host-to-phone' | 'phone-to-host'): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(master, hostId, deviceId), nonce)
  cipher.setAAD(Buffer.from(`superior:v1:${hostId}:${deviceId}:${direction}`))
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url')
}

export function decryptMobile(packet: string, master: string, hostId: string, deviceId: string, direction: 'host-to-phone' | 'phone-to-host'): unknown {
  if (!/^[A-Za-z0-9_-]{38,180000}$/.test(packet)) throw new Error('Invalid encrypted packet')
  const bytes = Buffer.from(packet, 'base64url')
  if (bytes.length < 29) throw new Error('Invalid encrypted packet')
  const decipher = createDecipheriv('aes-256-gcm', key(master, hostId, deviceId), bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(`superior:v1:${hostId}:${deviceId}:${direction}`))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'))
}
