import type { LayoutPreset, LayoutPresetsState } from '@shared/types'
import { createJsonListStore } from '../lib/jsonStore'

const store = createJsonListStore<LayoutPreset>('layout-presets.json', 'layouts', 'layout-presets')

export function listLayoutPresets(): LayoutPresetsState {
  return { layouts: store.read() }
}

/** Upsert a layout preset by id (adds when new, replaces when existing). */
export function saveLayoutPreset(layout: LayoutPreset): LayoutPresetsState {
  return { layouts: store.upsert(layout) }
}

export function deleteLayoutPreset(id: string): LayoutPresetsState {
  return { layouts: store.remove(id) }
}
