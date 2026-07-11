import { randomUUID } from 'crypto'
import type { GridLayoutData, TabsState, WorkspaceTabs } from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

function storeFile(): string {
  return userDataFile('layouts.json')
}

/** Legacy per-workspace layout shape (mutually-exclusive tabs/grid mode). */
interface LegacyWorkspaceLayout {
  mode: 'tabs' | 'grid'
  gridLayout?: GridLayoutData
}

/** A stored entry is legacy when it still carries a string `mode`. */
function isLegacy(value: unknown): value is LegacyWorkspaceLayout {
  return !!value && typeof value === 'object' && typeof (value as { mode?: unknown }).mode === 'string'
}

function isGridLayout(value: unknown): value is GridLayoutData {
  if (!value || typeof value !== 'object') return false
  const grid = value as Partial<GridLayoutData>
  return (
    Array.isArray(grid.rows) &&
    grid.rows.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0) &&
    Array.isArray(grid.cols) &&
    grid.cols.every(
      (row) =>
        Array.isArray(row) &&
        row.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
    )
  )
}

function isWorkspaceTabs(value: unknown): value is WorkspaceTabs {
  if (!value || typeof value !== 'object') return false
  const tabs = value as Partial<WorkspaceTabs>
  return (
    Array.isArray(tabs.tabs) &&
    typeof tabs.activeTabId === 'string' &&
    tabs.tabs.every(
      (tab) =>
        !!tab &&
        typeof tab === 'object' &&
        typeof tab.id === 'string' &&
        typeof tab.name === 'string' &&
        (tab.gridLayout === undefined || isGridLayout(tab.gridLayout))
    )
  )
}

/** Collapse a legacy workspace layout into a single grid tab. */
function migrateEntry(legacy: LegacyWorkspaceLayout): WorkspaceTabs {
  const id = randomUUID()
  return {
    tabs: [{ id, name: 'Tab 1', gridLayout: legacy.gridLayout }],
    activeTabId: id
  }
}

/**
 * Read persisted per-workspace tabs. Entries stored in the old {mode, gridLayout}
 * shape are collapsed into a single "Tab 1" grid and written back, so the freshly
 * minted tab ids stay stable across restarts.
 */
export function getTabs(): TabsState {
  const raw = readJsonFile<Record<string, unknown>>(storeFile(), {}, (p) =>
    p && typeof p === 'object' ? (p as Record<string, unknown>) : null
  )
  const state: TabsState = {}
  let migrated = false
  for (const [wsId, value] of Object.entries(raw)) {
    if (isLegacy(value)) {
      state[wsId] = migrateEntry(value)
      migrated = true
    } else if (isWorkspaceTabs(value)) {
      state[wsId] = value
    }
  }
  if (migrated) save(state)
  return state
}

function save(state: TabsState): void {
  writeJsonFile(storeFile(), state, 'tabs')
}

/** Persist one workspace's tabs and return the full state. */
export function setTabs(workspaceId: string, tabs: WorkspaceTabs): TabsState {
  const state = getTabs()
  state[workspaceId] = tabs
  save(state)
  return state
}
