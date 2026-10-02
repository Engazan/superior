import { describe, expect, it, vi } from 'vitest'
import {
  MobileOperations,
  type StoredMobileOperation,
} from './mobileOperations'
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
describe('mobile operation journal', () => {
  it('persists intent before execution and deduplicates while running and after completion', async () => {
    let saved: StoredMobileOperation[] = []
    const save = vi.fn((entries) => {
      saved = structuredClone(entries)
    })
    const ledger = new MobileOperations(() => [], save)
    const action = vi.fn(async () => {
      expect(saved[0].state).toBe('running')
      return { sessionId: 'terminal' }
    })
    ledger.start('device', 'operation', { type: 'create' }, action, () => {})
    ledger.start('device', 'operation', { type: 'create' }, action, () => {})
    await flush()
    expect(action).toHaveBeenCalledTimes(1)
    const restarted = new MobileOperations(() => saved, save)
    expect(
      restarted.start(
        'device',
        'operation',
        { type: 'create' },
        action,
        () => {},
      ).state,
    ).toBe('done')
    expect(() =>
      restarted.start(
        'device',
        'operation',
        { type: 'remove' },
        action,
        () => {},
      ),
    ).toThrow('request_conflict')
    expect(restarted.get('other', 'operation')).toBeUndefined()
  })
  it('never executes if intent cannot be persisted, and never retries interrupted work', () => {
    const action = vi.fn(async () => undefined)
    const ledger = new MobileOperations(
      () => [],
      () => {
        throw new Error('disk')
      },
    )
    expect(() => ledger.start('device', 'id', {}, action, () => {})).toThrow(
      'disk',
    )
    expect(action).not.toHaveBeenCalled()
    const saved: StoredMobileOperation[] = [
      {
        deviceId: 'device',
        requestId: 'id',
        fingerprint: 'x',
        state: 'running',
        startedAt: 1,
      },
    ]
    expect(
      new MobileOperations(
        () => saved,
        () => {},
      ).get('device', 'id')?.state,
    ).toBe('uncertain')
  })
  it('sanitizes failures and exposes no internal device fingerprint', async () => {
    const ledger = new MobileOperations(
      () => [],
      () => {},
    )
    ledger.start(
      'device',
      'id',
      {},
      async () => {
        throw new Error('/private/secrets/file')
      },
      () => {},
    )
    await flush()
    expect(ledger.get('device', 'id')).toMatchObject({
      state: 'failed',
      code: 'operation_failed',
    })
    expect(ledger.get('device', 'id')).not.toHaveProperty('fingerprint')
  })
})
