import { randomBytes, randomUUID } from 'crypto'
import * as fs from 'fs'
import { dirname } from 'path'
import { userDataFile } from '../lib/jsonStore'

export interface MobileDevice {
  id: string
  /** user-chosen label shown in Settings; absent → "Phone N" */
  name?: string
  master: string
  createdAt: number
  paired: boolean
  processedInputs: string[]
  lastPhoneSeq: number
}

export const MOBILE_DEVICE_NAME_MAX = 64

/** Trimmed, length-capped device label; empty means "no custom name". */
export function normalizeDeviceName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim().slice(0, MOBILE_DEVICE_NAME_MAX)
  return name || undefined
}

export interface MobileRelayConfig {
  enabled: boolean
  url: string
  hostId: string
  hostToken: string
  devices: MobileDevice[]
}

const file = (): string => userDataFile('mobile-relay.json')

export function readMobileRelayConfig(): MobileRelayConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<MobileRelayConfig>
    if (typeof raw.hostId === 'string' && typeof raw.hostToken === 'string' && Array.isArray(raw.devices)) {
      return {
        enabled: raw.enabled === true,
        url: typeof raw.url === 'string' ? raw.url : '',
        hostId: raw.hostId,
        hostToken: raw.hostToken,
        devices: raw.devices.filter((d): d is MobileDevice => !!d && typeof d.id === 'string' && typeof d.master === 'string').map((d) => ({
          ...d,
          name: normalizeDeviceName(d.name),
          processedInputs: Array.isArray(d.processedInputs) ? d.processedInputs : [],
          lastPhoneSeq: Number.isSafeInteger(d.lastPhoneSeq) && d.lastPhoneSeq >= 0 ? d.lastPhoneSeq : 0
        }))
      }
    }
  } catch { /* first launch or invalid store */ }
  return { enabled: false, url: '', hostId: randomUUID(), hostToken: randomBytes(32).toString('base64url'), devices: [] }
}

export function writeMobileRelayConfig(config: MobileRelayConfig): void {
  const path = file()
  fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temp = `${path}.${process.pid}.tmp`
  fs.writeFileSync(temp, JSON.stringify(config), { mode: 0o600 })
  fs.renameSync(temp, path)
  if (process.platform !== 'win32') fs.chmodSync(path, 0o600)
}
