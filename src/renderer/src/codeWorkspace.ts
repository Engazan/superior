import type { FsEntry } from './types'

export type WorkspaceMode = 'terminals' | 'code' | 'browser'
export const nextWorkspaceMode = (mode: WorkspaceMode): WorkspaceMode => mode === 'terminals' ? 'code' : mode === 'code' ? 'browser' : 'terminals'
export type EditorGroup = 0 | 1
export interface CodeTab {
  file: FsEntry
  group: EditorGroup
  line?: number
  requestId: number
}
export interface CodeWorkspaceState {
  mode: WorkspaceMode
  tabs: CodeTab[]
  selected: [string | null, string | null]
  focusedGroup: EditorGroup
  split: boolean
  ratio: number
}
export const emptyCodeWorkspace = (): CodeWorkspaceState => ({
  mode: 'terminals', tabs: [], selected: [null, null], focusedGroup: 0, split: false, ratio: 0.5
})
export type CodeAction =
  | { type: 'mode'; mode: WorkspaceMode }
  | { type: 'open'; file: FsEntry; line?: number }
  | { type: 'select'; path: string }
  | { type: 'close'; path: string }
  | { type: 'move'; path: string; group: EditorGroup }
  | { type: 'split' }
  | { type: 'merge' }
  | { type: 'focus'; group: EditorGroup }
  | { type: 'resize'; ratio: number }

export function reduceCodeWorkspace(state: CodeWorkspaceState, action: CodeAction): CodeWorkspaceState {
  const selected: CodeWorkspaceState['selected'] = [...state.selected]
  switch (action.type) {
    case 'mode': return { ...state, mode: action.mode }
    case 'focus': return { ...state, focusedGroup: action.group }
    case 'resize': return { ...state, ratio: Math.max(0.2, Math.min(0.8, action.ratio)) }
    case 'open': {
      if (action.file.isDirectory) return state
      const existing = state.tabs.find((tab) => tab.file.path === action.file.path)
      const group = existing?.group ?? state.focusedGroup
      selected[group] = action.file.path
      const tab: CodeTab = { file: action.file, group, line: action.line, requestId: (existing?.requestId ?? 0) + 1 }
      return { ...state, mode: 'code', focusedGroup: group, selected,
        tabs: existing ? state.tabs.map((item) => item === existing ? tab : item) : [...state.tabs, tab] }
    }
    case 'select': {
      const tab = state.tabs.find((item) => item.file.path === action.path)
      if (!tab) return state
      selected[tab.group] = action.path
      return { ...state, selected, focusedGroup: tab.group }
    }
    case 'close': {
      const tab = state.tabs.find((item) => item.file.path === action.path)
      if (!tab) return state
      const tabs = state.tabs.filter((item) => item !== tab)
      if (selected[tab.group] === action.path) {
        const siblings = state.tabs.filter((item) => item.group === tab.group)
        const index = siblings.indexOf(tab)
        selected[tab.group] = (siblings[index + 1] ?? siblings[index - 1])?.file.path ?? null
      }
      return { ...state, tabs, selected }
    }
    case 'move': {
      const tab = state.tabs.find((item) => item.file.path === action.path)
      if (!tab) return state
      if (tab.group === action.group) return reduceCodeWorkspace(state, { type: 'select', path: action.path })
      if (tab.group !== action.group && selected[tab.group] === action.path) {
        selected[tab.group] = state.tabs.find((item) => item !== tab && item.group === tab.group)?.file.path ?? null
      }
      selected[action.group] = action.path
      return { ...state, split: true, selected, focusedGroup: action.group,
        tabs: state.tabs.map((item) => item === tab ? { ...item, group: action.group } : item) }
    }
    case 'split': {
      const path = selected[state.focusedGroup]
      return path ? reduceCodeWorkspace(state, { type: 'move', path, group: state.focusedGroup === 0 ? 1 : 0 })
        : { ...state, split: true, focusedGroup: 1 }
    }
    case 'merge': return { ...state, split: false, focusedGroup: 0,
      selected: [selected[state.focusedGroup] ?? selected[0] ?? selected[1], null],
      tabs: state.tabs.map((tab) => ({ ...tab, group: 0 })) }
  }
}

/** Persist only navigation metadata; file contents never go into browser storage. */
export function restoreCodeWorkspaces(raw: string | null): Record<string, CodeWorkspaceState> {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, CodeWorkspaceState> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || !Array.isArray(value.tabs)) continue
      let state = emptyCodeWorkspace()
      for (const tab of value.tabs) {
        if (!tab?.file || typeof tab.file.path !== 'string' || typeof tab.file.name !== 'string' || tab.file.isDirectory !== false) continue
        state = { ...state, focusedGroup: 0 }
        state = reduceCodeWorkspace(state, { type: 'open', file: tab.file })
        if (value.split === true && tab.group === 1) state = reduceCodeWorkspace(state, { type: 'move', path: tab.file.path, group: 1 })
      }
      if (Array.isArray(value.selected)) {
        for (const path of value.selected) if (typeof path === 'string') state = reduceCodeWorkspace(state, { type: 'select', path })
      }
      result[id] = { ...state, mode: value.mode === 'browser' ? 'browser' : value.mode === 'code' ? 'code' : 'terminals', split: value.split === true,
        focusedGroup: value.split === true && value.focusedGroup === 1 ? 1 : 0,
        ratio: typeof value.ratio === 'number' && Number.isFinite(value.ratio) ? Math.max(0.2, Math.min(0.8, value.ratio)) : 0.5 }
    }
    return result
  } catch { return {} }
}
