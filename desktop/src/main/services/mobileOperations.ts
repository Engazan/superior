import { createHash } from 'crypto'
import type { MobileOperation } from '@shared/mobileRelay'

export interface StoredMobileOperation extends MobileOperation {
  deviceId: string
  fingerprint: string
}
/** Persist the intent before touching PTYs/git; a restart never replays unfinished work. */
export class MobileOperations {
  private entries: StoredMobileOperation[]
  constructor(
    read: () => StoredMobileOperation[],
    private readonly save: (entries: StoredMobileOperation[]) => void,
  ) {
    this.entries = read().map((entry) =>
      entry.state === 'running'
        ? { ...entry, state: 'uncertain' as const }
        : entry,
    )
  }
  get(deviceId: string, requestId: string): MobileOperation | undefined {
    const entry = this.entries.find(
      (item) => item.deviceId === deviceId && item.requestId === requestId,
    )
    if (!entry) return
    const {
      deviceId: _deviceId,
      fingerprint: _fingerprint,
      ...publicEntry
    } = entry
    return publicEntry
  }
  start(
    deviceId: string,
    requestId: string,
    payload: object,
    action: () => Promise<MobileOperation['result']>,
    finished: () => void,
  ): MobileOperation {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
    const previous = this.entries.find(
      (item) => item.deviceId === deviceId && item.requestId === requestId,
    )
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new Error('request_conflict')
      return this.get(deviceId, requestId)!
    }
    // Refuse rather than evict deduplication evidence and execute an old request twice.
    if (
      this.entries.filter((entry) => entry.deviceId === deviceId).length >= 2000
    )
      throw new Error('operation_limit_repair_device')
    const entry: StoredMobileOperation = {
      deviceId,
      requestId,
      fingerprint,
      state: 'running',
      startedAt: Date.now(),
    }
    this.entries.push(entry)
    try {
      this.save(this.entries)
    } catch (err) {
      this.entries.pop()
      throw err
    }
    void action()
      .then(
        (result) => {
          entry.state = 'done'
          entry.result = result
        },
        (err) => {
          entry.state = 'failed'
          const message = err instanceof Error ? err.message : ''
          entry.code = /^[a-z_]+$/.test(message)
            ? message
            : message.startsWith('worktree:')
              ? 'worktree_failed'
              : 'operation_failed'
        },
      )
      .then(() => {
        try {
          this.save(this.entries)
        } catch {
          entry.state = 'uncertain'
          entry.code = 'persistence_failed'
        }
        try {
          finished()
        } catch {
          /* A closed renderer cannot invalidate a completed mutation. */
        }
      })
    return this.get(deviceId, requestId)!
  }
}
