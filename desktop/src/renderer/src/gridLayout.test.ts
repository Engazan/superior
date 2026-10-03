import { describe, expect, it } from 'vitest'
import {
  applyDividerDrag,
  distribute,
  gridDividers,
  gridRects,
  matchesDist,
  uniformLayout
} from './gridLayout'

describe('distribute', () => {
  it('always accounts for every cell', () => {
    for (let n = 1; n <= 12; n++) {
      expect(distribute(n).reduce((a, b) => a + b, 0)).toBe(n)
    }
  })
})

describe('gridRects', () => {
  it('produces one percent-bounded rect per cell', () => {
    for (let n = 1; n <= 12; n++) {
      const dist = distribute(n)
      const rects = gridRects(dist, uniformLayout(dist))
      expect(rects).toHaveLength(n)
      for (const r of rects) {
        expect(r.left).toBeGreaterThanOrEqual(0)
        expect(r.top).toBeGreaterThanOrEqual(0)
        expect(r.left + r.width).toBeLessThanOrEqual(100.0001)
        expect(r.top + r.height).toBeLessThanOrEqual(100.0001)
        expect(r.width).toBeGreaterThan(0)
        expect(r.height).toBeGreaterThan(0)
      }
    }
  })
})

describe('applyDividerDrag', () => {
  it('keeps the layout shape and stays within bounds', () => {
    const dist = distribute(4)
    const layout = uniformLayout(dist)
    for (const d of gridDividers(dist, layout)) {
      const dragged = applyDividerDrag(layout, d, 0.3, false)
      expect(matchesDist(dragged, dist)).toBe(true)
      for (const r of gridRects(dist, dragged)) {
        expect(r.width).toBeGreaterThan(0)
        expect(r.height).toBeGreaterThan(0)
        expect(r.left + r.width).toBeLessThanOrEqual(100.0001)
        expect(r.top + r.height).toBeLessThanOrEqual(100.0001)
      }
    }
  })

  it('never collapses a cell below the minimum, even at extreme fractions', () => {
    const dist = distribute(2)
    const layout = uniformLayout(dist)
    for (const d of gridDividers(dist, layout)) {
      for (const fraction of [0, 0.01, 0.99, 1]) {
        const dragged = applyDividerDrag(layout, d, fraction, false)
        for (const r of gridRects(dist, dragged)) {
          // MIN_FRAC is 8% of the panel.
          expect(r.width).toBeGreaterThanOrEqual(7.9)
          expect(r.height).toBeGreaterThanOrEqual(7.9)
        }
      }
    }
  })

  it('splits the dragged pair at the requested fraction', () => {
    const dist = distribute(2) // one row, two columns
    const layout = uniformLayout(dist)
    const [divider] = gridDividers(dist, layout)
    const dragged = applyDividerDrag(layout, divider, 0.3, false)
    expect(dragged.cols[0][0]).toBeCloseTo(0.3, 5)
    expect(dragged.cols[0][1]).toBeCloseTo(0.7, 5)
  })
})
