import type { PaneDirection, PaneNode } from '@shared/types'
import { insertPane, paneIds, prunePanes, validPaneTree } from '@shared/pane-layout'
import { distribute, matchesDist, uniformLayout, type GridLayout, type Rect } from './gridLayout'

/** Migrate the row grid without changing any existing cell rectangle. */
export function resolvePaneTree(ids: string[], layout?: GridLayout): PaneNode | undefined {
  if (!ids.length) return undefined
  let tree = layout?.tree && validPaneTree(layout.tree) ? prunePanes(layout.tree, new Set(ids)) : undefined
  if (!tree) {
    const dist = distribute(ids.length)
    const grid = matchesDist(layout, dist) ? layout! : uniformLayout(dist)
    let offset = 0
    const group = (nodes: PaneNode[], weights: number[], axis: 'v' | 'h'): PaneNode => nodes.length === 1 ? nodes[0] : ({
      kind: 'split', axis, ratio: weights[0] / weights.reduce((a, b) => a + b, 0), first: nodes[0],
      second: group(nodes.slice(1), weights.slice(1), axis)
    })
    const rows = dist.map((count, i) => {
      const leaves: PaneNode[] = ids.slice(offset, offset + count).map((sessionId) => ({ kind: 'leaf', sessionId }))
      offset += count
      return group(leaves, grid.cols[i], 'v')
    })
    return group(rows, grid.rows, 'h')
  }
  const existing = new Set(paneIds(tree))
  for (const id of ids) if (!existing.has(id)) tree = insertPane(tree, paneIds(tree).at(-1)!, id, 'right')
  return tree
}

export interface PaneDivider { axis: 'v' | 'h'; pos: number; start: number; length: number; path: string; bounds: Rect; ratio: number }
export function paneGeometry(tree?: PaneNode): { rects: Map<string, Rect>; dividers: PaneDivider[] } {
  const rects = new Map<string, Rect>()
  const dividers: PaneDivider[] = []
  const visit = (node: PaneNode, r: Rect, path: string): void => {
    if (node.kind === 'leaf') { rects.set(node.sessionId, r); return }
    const vertical = node.axis === 'v'
    const first = { ...r, width: vertical ? r.width * node.ratio : r.width, height: vertical ? r.height : r.height * node.ratio }
    const second = { ...r, left: vertical ? r.left + first.width : r.left, top: vertical ? r.top : r.top + first.height,
      width: vertical ? r.width - first.width : r.width, height: vertical ? r.height : r.height - first.height }
    dividers.push({ axis: node.axis, pos: vertical ? second.left : second.top, start: vertical ? r.top : r.left,
      length: vertical ? r.height : r.width, path, bounds: r, ratio: node.ratio })
    visit(node.first, first, path + '0'); visit(node.second, second, path + '1')
  }
  if (tree) visit(tree, { top: 0, left: 0, width: 100, height: 100 }, '')
  return { rects, dividers }
}

export function resizePane(tree: PaneNode, path: string, ratio: number): PaneNode {
  if (tree.kind === 'leaf') return tree
  if (!path) return { ...tree, ratio: Math.max(0.08, Math.min(0.92, ratio)) }
  return path[0] === '0' ? { ...tree, first: resizePane(tree.first, path.slice(1), ratio) }
    : { ...tree, second: resizePane(tree.second, path.slice(1), ratio) }
}

export function dropDirection(x: number, y: number, r: Rect): PaneDirection {
  const dx = (x - r.left) / r.width, dy = (y - r.top) / r.height
  return (Object.entries({ top: dy, bottom: 1 - dy, left: dx, right: 1 - dx }).sort((a, b) => a[1] - b[1])[0][0]) as PaneDirection
}
