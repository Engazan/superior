import { describe, expect, it } from 'vitest'
import { emptyCodeWorkspace, reduceCodeWorkspace as reduce, restoreCodeWorkspaces } from './codeWorkspace'

const file = (name: string) => ({ path: `/project/${name}`, name, isDirectory: false })
const open = (name: string) => ({ type: 'open' as const, file: file(name) })

describe('Code workspace navigation', () => {
  it('keeps multiple tabs when opening files and reuses an existing tab for line links', () => {
    let state = reduce(reduce(emptyCodeWorkspace(), open('a.ts')), open('b.ts'))
    state = reduce(state, { ...open('a.ts'), line: 24 })
    expect(state.tabs.map((tab) => tab.file.name)).toEqual(['a.ts', 'b.ts'])
    expect(state.tabs[0]).toMatchObject({ line: 24, requestId: 2 })
    expect(state.selected).toEqual(['/project/a.ts', null])
    expect(state.mode).toBe('code')
  })

  it('preserves file navigation and split layout across terminal mode switches', () => {
    let state = reduce(reduce(emptyCodeWorkspace(), open('a.ts')), open('b.ts'))
    state = reduce(state, { type: 'split' })
    expect(state.selected).toEqual(['/project/a.ts', '/project/b.ts'])
    state = reduce(state, { type: 'resize', ratio: 0.63 })
    const before = state
    state = reduce(reduce(state, { type: 'mode', mode: 'terminals' }), { type: 'mode', mode: 'code' })
    expect(state).toEqual(before)
    expect(state.tabs).toBe(before.tabs)
  })

  it('selects a sibling when closing the selected tab without changing the other group', () => {
    let state = reduce(reduce(reduce(emptyCodeWorkspace(), open('a.ts')), open('b.ts')), open('c.ts'))
    state = reduce(state, { type: 'split' })
    state = reduce(state, { type: 'close', path: '/project/b.ts' })
    expect(state.selected).toEqual(['/project/a.ts', '/project/c.ts'])
    state = reduce(state, { type: 'close', path: '/project/c.ts' })
    expect(state.selected).toEqual(['/project/a.ts', null])
    expect(state.mode).toBe('code')
  })

  it('moves tabs between groups and merges without duplicating or dropping files', () => {
    let state = reduce(reduce(emptyCodeWorkspace(), open('a.ts')), open('b.ts'))
    state = reduce(state, { type: 'move', path: '/project/a.ts', group: 1 })
    expect(state.selected).toEqual(['/project/b.ts', '/project/a.ts'])
    state = reduce(state, { type: 'merge' })
    expect(state.tabs.map((tab) => tab.group)).toEqual([0, 0])
    expect(state.selected).toEqual(['/project/a.ts', null])
    expect(state.split).toBe(false)
  })

  it('restores independent workspace modes, groups, selected files and divider widths', () => {
    let first = reduce(reduce(emptyCodeWorkspace(), open('a.ts')), open('b.ts'))
    first = reduce(first, { type: 'move', path: '/project/a.ts', group: 1 })
    first = reduce(first, { type: 'resize', ratio: 0.65 })
    const second = reduce(reduce(emptyCodeWorkspace(), open('c.ts')), { type: 'mode', mode: 'terminals' })
    const restored = restoreCodeWorkspaces(JSON.stringify({ first, second }))
    expect(restored).toEqual({ first, second })
  })

  it('ignores invalid storage and directories, clamps persisted geometry', () => {
    expect(restoreCodeWorkspaces('{')).toEqual({})
    expect(restoreCodeWorkspaces('null')).toEqual({})
    const state = restoreCodeWorkspaces(JSON.stringify({ bad: { tabs: [null, {}, { file: { ...file('dir'), isDirectory: true } }], ratio: 3 } })).bad
    expect(state.tabs).toEqual([])
    expect(state.ratio).toBe(0.8)
    expect(reduce(emptyCodeWorkspace(), { type: 'open', file: { ...file('dir'), isDirectory: true } }).tabs).toEqual([])
  })
})
