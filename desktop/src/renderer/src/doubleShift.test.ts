import { describe, expect, it } from 'vitest'
import { advanceDoubleShift, DOUBLE_SHIFT_WINDOW_MS } from './doubleShift'

describe('advanceDoubleShift', () => {
  it('triggers for two Shift presses inside the shortcut window', () => {
    const first = advanceDoubleShift(null, 'Shift', 1_000)
    expect(advanceDoubleShift(first.lastShiftAt, 'Shift', 1_200)).toEqual({
      lastShiftAt: null,
      triggered: true
    })
  })

  it('starts a new sequence when the second Shift is too late', () => {
    expect(advanceDoubleShift(1_000, 'Shift', 1_000 + DOUBLE_SHIFT_WINDOW_MS + 1)).toEqual({
      lastShiftAt: 1_000 + DOUBLE_SHIFT_WINDOW_MS + 1,
      triggered: false
    })
  })

  it('cancels the sequence when another key is pressed', () => {
    expect(advanceDoubleShift(1_000, 'A', 1_100)).toEqual({
      lastShiftAt: null,
      triggered: false
    })
  })
})
