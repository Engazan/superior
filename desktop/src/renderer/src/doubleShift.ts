export const DOUBLE_SHIFT_WINDOW_MS = 500

export interface DoubleShiftResult {
  lastShiftAt: number | null
  triggered: boolean
}

/**
 * Advance the double-Shift shortcut state. Any intervening non-Shift key
 * cancels the sequence, so ordinary Shift-modified typing cannot open search.
 */
export function advanceDoubleShift(
  lastShiftAt: number | null,
  key: string,
  now: number
): DoubleShiftResult {
  if (key !== 'Shift') return { lastShiftAt: null, triggered: false }

  if (lastShiftAt !== null && now - lastShiftAt <= DOUBLE_SHIFT_WINDOW_MS) {
    return { lastShiftAt: null, triggered: true }
  }

  return { lastShiftAt: now, triggered: false }
}
