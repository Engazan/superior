import type { LayoutsState, WorkspaceLayout } from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

function storeFile(): string {
  return userDataFile('layouts.json')
}

/** Read persisted per-workspace layouts (tabs/grid + grid sizing). */
export function getLayouts(): LayoutsState {
  return readJsonFile<LayoutsState>(storeFile(), {}, (p) =>
    p && typeof p === 'object' ? (p as LayoutsState) : null
  )
}

function save(state: LayoutsState): void {
  writeJsonFile(storeFile(), state, 'layout')
}

/** Persist one workspace's layout and return the full state. */
export function setLayout(workspaceId: string, layout: WorkspaceLayout): LayoutsState {
  const state = getLayouts()
  state[workspaceId] = layout
  save(state)
  return state
}
