import type { PaneDirection, PaneNode } from './types'

export function paneIds(tree: PaneNode | undefined): string[] {
  return !tree ? [] : tree.kind === 'leaf' ? [tree.sessionId] : [...paneIds(tree.first), ...paneIds(tree.second)]
}

export function validPaneTree(value: unknown): value is PaneNode {
  const ids = new Set<string>()
  let count = 0
  const check = (node: unknown, depth: number): boolean => {
    if (!node || typeof node !== 'object' || depth > 24 || ++count > 255) return false
    const n = node as PaneNode
    if (n.kind === 'leaf') {
      if (typeof n.sessionId !== 'string' || !n.sessionId || n.sessionId.length > 256 || ids.has(n.sessionId)) return false
      ids.add(n.sessionId)
      return true
    }
    return n.kind === 'split' && (n.axis === 'v' || n.axis === 'h') && Number.isFinite(n.ratio) &&
      n.ratio >= 0.08 && n.ratio <= 0.92 && check(n.first, depth + 1) && check(n.second, depth + 1)
  }
  return check(value, 0)
}

export function prunePanes(tree: PaneNode | undefined, keep: Set<string>): PaneNode | undefined {
  if (!tree) return undefined
  if (tree.kind === 'leaf') return keep.has(tree.sessionId) ? tree : undefined
  const first = prunePanes(tree.first, keep)
  const second = prunePanes(tree.second, keep)
  return first && second ? { ...tree, first, second } : first ?? second
}

export function insertPane(tree: PaneNode, target: string, id: string, direction: PaneDirection): PaneNode {
  if (tree.kind === 'leaf') {
    if (tree.sessionId !== target) return tree
    const leaf: PaneNode = { kind: 'leaf', sessionId: id }
    const before = direction === 'left' || direction === 'top'
    return { kind: 'split', axis: direction === 'left' || direction === 'right' ? 'v' : 'h', ratio: 0.5,
      first: before ? leaf : tree, second: before ? tree : leaf }
  }
  return { ...tree, first: insertPane(tree.first, target, id, direction), second: insertPane(tree.second, target, id, direction) }
}

export function movePane(tree: PaneNode, source: string, target: string, direction: PaneDirection): PaneNode {
  const ids = paneIds(tree)
  if (source === target || !ids.includes(source) || !ids.includes(target)) return tree
  // Dropping onto the same adjacent slot must not reset a custom divider ratio.
  if (tree.kind === 'split') {
    const before = direction === 'left' || direction === 'top'
    if (tree.axis === (direction === 'left' || direction === 'right' ? 'v' : 'h') &&
      tree.first.kind === 'leaf' && tree.second.kind === 'leaf' &&
      tree.first.sessionId === (before ? source : target) && tree.second.sessionId === (before ? target : source)) return tree
    const containing = [tree.first, tree.second].find((n) => paneIds(n).includes(source) && paneIds(n).includes(target))
    if (containing && movePane(containing, source, target, direction) === containing) return tree
  }
  return insertPane(prunePanes(tree, new Set(ids.filter((id) => id !== source)))!, target, source, direction)
}

export function replacePaneId(tree: PaneNode, oldId: string, newId: string): PaneNode {
  return tree.kind === 'leaf' ? { ...tree, sessionId: tree.sessionId === oldId ? newId : tree.sessionId }
    : { ...tree, first: replacePaneId(tree.first, oldId, newId), second: replacePaneId(tree.second, oldId, newId) }
}
