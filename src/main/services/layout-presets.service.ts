import type { LayoutPreset, LayoutPresetsState } from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

function storeFile(): string {
  return userDataFile('layout-presets.json')
}

function save(state: LayoutPresetsState): void {
  writeJsonFile(storeFile(), state, 'layout-presets')
}

function read(): LayoutPresetsState {
  const parsed = readJsonFile<LayoutPresetsState | null>(storeFile(), null, (p) => {
    const obj = p as Partial<LayoutPresetsState>
    return obj && Array.isArray(obj.layouts) ? { layouts: obj.layouts } : null
  })
  return parsed ?? { layouts: [] }
}

export function listLayoutPresets(): LayoutPresetsState {
  return read()
}

/** Upsert a layout preset by id (adds when new, replaces when existing). */
export function saveLayoutPreset(layout: LayoutPreset): LayoutPresetsState {
  const state = read()
  const idx = state.layouts.findIndex((l) => l.id === layout.id)
  if (idx >= 0) state.layouts[idx] = layout
  else state.layouts.push(layout)
  save(state)
  return state
}

export function deleteLayoutPreset(id: string): LayoutPresetsState {
  const state = read()
  state.layouts = state.layouts.filter((l) => l.id !== id)
  save(state)
  return state
}
