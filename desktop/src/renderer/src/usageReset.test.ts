import { describe, expect, it } from 'vitest'
import { resetWindows } from './usageReset'
import type { AccountUsage } from './types'

const snapshot = (updatedAt: number, resetsAt: number, usedPercent = 50): AccountUsage => ({
  profileId: 'claude:default', authFingerprint: 'account', status: 'ready', plan: 'pro', updatedAt,
  windows: [{ id: 'five_hour', label: '5h', usedPercent, resetsAt }]
})

describe('usage reset detection', () => {
  it('announces a server-confirmed new period even if work already consumed some quota', () => {
    expect(resetWindows(snapshot(100, 200, 5), snapshot(210, 400, 10))).toHaveLength(1)
  })
  it('does not announce initial load or identical cached responses', () => {
    expect(resetWindows(undefined, snapshot(210, 400))).toEqual([])
    expect(resetWindows(snapshot(100, 200), snapshot(100, 200))).toEqual([])
  })
  it('does not infer a reset from a usage correction or an elapsed timer alone', () => {
    expect(resetWindows(snapshot(100, 200, 70), snapshot(150, 200, 5))).toEqual([])
    expect(resetWindows(snapshot(100, 200), snapshot(210, 200))).toEqual([])
    expect(resetWindows(snapshot(100, 200), snapshot(150, 400))).toEqual([])
  })
  it('rejects account changes and failed or out-of-order readings', () => {
    expect(resetWindows(snapshot(100, 200), { ...snapshot(210, 400), authFingerprint: 'other' })).toEqual([])
    expect(resetWindows(snapshot(100, 200), { ...snapshot(210, 400), status: 'unavailable' })).toEqual([])
    expect(resetWindows({ ...snapshot(100, 200), status: 'unavailable' }, snapshot(210, 400))).toEqual([])
    expect(resetWindows(snapshot(210, 400), snapshot(100, 200))).toEqual([])
  })
})
