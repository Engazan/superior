import { describe, expect, it } from 'vitest'
import { insertPane, movePane, paneIds, prunePanes, replacePaneId, validPaneTree } from '@shared/pane-layout'
import type { PaneDirection, PaneNode } from '@shared/types'
import { distribute, gridRects, uniformLayout } from './gridLayout'
import { dropDirection, paneGeometry, resizePane, resolvePaneTree } from './paneLayout'

const leaf = (sessionId: string): PaneNode => ({ kind: 'leaf', sessionId })
const directions: PaneDirection[] = ['left', 'right', 'top', 'bottom']

describe('persistent terminal splits', () => {
  it('migrates every legacy grid without moving its cells', () => {
    for (let n = 1; n <= 12; n++) {
      const ids = Array.from({ length: n }, (_, i) => String(i))
      const dist = distribute(n), grid = uniformLayout(dist)
      const tree = resolvePaneTree(ids, grid)!
      expect(validPaneTree(tree)).toBe(true)
      const actual = paneGeometry(tree).rects
      gridRects(dist, grid).forEach((r, i) => {
        for (const key of ['top', 'left', 'width', 'height'] as const) expect(actual.get(ids[i])![key]).toBeCloseTo(r[key])
      })
    }
  })

  it.each(directions)('inserts a different terminal %s without replacing the target', (direction) => {
    const tree = insertPane(leaf('claude'), 'claude', 'codex', direction)
    expect(paneIds(tree).sort()).toEqual(['claude', 'codex'])
    expect(validPaneTree(tree)).toBe(true)
    const r = paneGeometry(tree).rects.get('codex')!
    expect(r).toMatchObject(direction === 'left' ? { left: 0, width: 50 } : direction === 'right' ? { left: 50, width: 50 }
      : direction === 'top' ? { top: 0, height: 50 } : { top: 50, height: 50 })
  })

  it('splits one panel only, leaving its sibling unchanged', () => {
    const original = insertPane(leaf('a'), 'a', 'b', 'right')
    const next = insertPane(original, 'b', 'c', 'bottom')
    expect(paneGeometry(next).rects.get('a')).toEqual(paneGeometry(original).rects.get('a'))
    expect(paneGeometry(next).rects.get('c')).toEqual({ top: 50, left: 50, width: 50, height: 50 })
  })

  it.each(directions)('moves existing panels %s without duplicates or gaps', (direction) => {
    const original = resolvePaneTree(['a', 'b', 'c', 'd'])!
    const moved = movePane(original, 'a', 'd', direction)
    expect(paneIds(moved).sort()).toEqual(['a', 'b', 'c', 'd'])
    const rects = [...paneGeometry(moved).rects.values()]
    expect(rects.reduce((area, r) => area + r.width * r.height, 0)).toBeCloseTo(10000)
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j]
      expect(Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))).toBeCloseTo(0)
    }
  })

  it('does not resize an already-adjacent drop or a self drop', () => {
    const tree = resizePane(insertPane(leaf('a'), 'a', 'b', 'right'), '', 0.3)
    expect(movePane(tree, 'a', 'b', 'left')).toBe(tree)
    expect(movePane(tree, 'a', 'a', 'bottom')).toBe(tree)
    expect(movePane(tree, 'missing', 'a', 'right')).toBe(tree)
  })

  it('collapses empty parents after close and keeps restart slots and ratios', () => {
    const tree = insertPane(insertPane(leaf('a'), 'a', 'b', 'right'), 'b', 'c', 'bottom')
    const resized = resizePane(tree, '1', 0.65)
    const restarted = replacePaneId(resized, 'c', 'new-c')
    expect(paneGeometry(restarted).rects.get('new-c')).toEqual(paneGeometry(resized).rects.get('c'))
    const closed = prunePanes(restarted, new Set(['a', 'new-c']))!
    expect(paneGeometry(closed).rects.get('new-c')).toEqual({ top: 0, left: 50, width: 50, height: 100 })
    expect(resolvePaneTree(['a', 'new-c'], { rows: [], cols: [], tree: JSON.parse(JSON.stringify(closed)) })).toEqual(closed)
  })

  it('adds normal + sessions without rearranging a saved tree', () => {
    const tree = resolvePaneTree(['a', 'b'])!
    const next = resolvePaneTree(['a', 'b', 'c'], { rows: [], cols: [], tree })!
    expect(paneGeometry(next).rects.get('a')).toEqual(paneGeometry(tree).rects.get('a'))
  })

  it('rejects malformed, duplicate and excessively deep saved trees', () => {
    expect(validPaneTree({ kind: 'split', axis: 'v', ratio: NaN, first: leaf('a'), second: leaf('b') })).toBe(false)
    expect(validPaneTree(insertPane(leaf('a'), 'a', 'a', 'right'))).toBe(false)
    let tree = leaf('0')
    for (let i = 1; i < 30; i++) tree = insertPane(tree, String(i - 1), String(i), 'bottom')
    expect(validPaneTree(tree)).toBe(false)
  })

  it('chooses normalized nearest edges for wide or tall target panes', () => {
    const r = { top: 20, left: 10, width: 70, height: 30 }
    expect(dropDirection(11, 35, r)).toBe('left')
    expect(dropDirection(79, 35, r)).toBe('right')
    expect(dropDirection(45, 21, r)).toBe('top')
    expect(dropDirection(45, 49, r)).toBe('bottom')
  })
})
