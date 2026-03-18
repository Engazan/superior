import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { LayoutsState, WorkspaceLayout } from '@shared/types'

function storeFile(): string {
  return path.join(app.getPath('userData'), 'layouts.json')
}

/** Read persisted per-workspace layouts (tabs/grid + grid sizing). */
export function getLayouts(): LayoutsState {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf-8')
    const parsed = JSON.parse(raw) as LayoutsState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function save(state: LayoutsState): void {
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('[layout] failed to persist layouts:', err)
  }
}

/** Persist one workspace's layout and return the full state. */
export function setLayout(workspaceId: string, layout: WorkspaceLayout): LayoutsState {
  const state = getLayouts()
  state[workspaceId] = layout
  save(state)
  return state
}
