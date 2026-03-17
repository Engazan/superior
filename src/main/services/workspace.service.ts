import { app, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { Workspace, WorkspaceState } from '@shared/types'

function storeFile(): string {
  return path.join(app.getPath('userData'), 'workspaces.json')
}

function legacyFile(): string {
  return path.join(app.getPath('userData'), 'workspace.json')
}

/** True if the path exists and is a directory. */
export function isValidWorkspaceDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function makeWorkspace(dir: string): Workspace {
  return { path: dir, name: path.basename(dir) || dir, lastOpenedAt: Date.now() }
}

/** Read raw state from disk, migrating the legacy single-workspace file if needed. */
function readState(): WorkspaceState {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf-8')
    const state = JSON.parse(raw) as Partial<WorkspaceState>
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : []
    return normalize({ workspaces, activePath: state.activePath ?? null })
  } catch {
    return migrateLegacy()
  }
}

/** If an old workspace.json exists, seed the new state from it (best effort). */
function migrateLegacy(): WorkspaceState {
  try {
    const raw = fs.readFileSync(legacyFile(), 'utf-8')
    const ws = JSON.parse(raw) as Workspace
    if (ws?.path) {
      return normalize({ workspaces: [ws], activePath: ws.path })
    }
  } catch {
    /* no legacy file */
  }
  return { workspaces: [], activePath: null }
}

/** Ensure activePath points at an existing entry (or null), without dropping entries. */
function normalize(state: WorkspaceState): WorkspaceState {
  const has = (p: string | null): boolean => !!p && state.workspaces.some((w) => w.path === p)
  const activePath = has(state.activePath)
    ? state.activePath
    : state.workspaces.length
      ? state.workspaces[state.workspaces.length - 1].path
      : null
  return { workspaces: state.workspaces, activePath }
}

function saveState(state: WorkspaceState): void {
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('[workspace] failed to persist workspaces:', err)
  }
}

/** Return all saved workspaces and the active selection. */
export function listWorkspaces(): WorkspaceState {
  return readState()
}

/**
 * Open the native directory picker and add the chosen folder.
 * Re-selecting an already-saved folder just re-activates it (dedupe by path).
 * Returns the updated state, or null if the user cancelled.
 * @throws Error with a friendly message if the chosen path is not a valid directory.
 */
export async function addWorkspace(): Promise<WorkspaceState | null> {
  const result = await dialog.showOpenDialog({
    title: 'Open from folder',
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const dir = result.filePaths[0]
  if (!isValidWorkspaceDir(dir)) {
    throw new Error('The selected path is not a valid folder.')
  }

  const state = readState()
  const existing = state.workspaces.find((w) => w.path === dir)
  if (!existing) {
    state.workspaces.push(makeWorkspace(dir))
  } else {
    existing.lastOpenedAt = Date.now()
  }
  state.activePath = dir

  const next = normalize(state)
  saveState(next)
  return next
}

/** Remove a workspace from the saved list. Does not touch files on disk. */
export function removeWorkspace(targetPath: string): WorkspaceState {
  const state = readState()
  state.workspaces = state.workspaces.filter((w) => w.path !== targetPath)
  if (state.activePath === targetPath) state.activePath = null
  const next = normalize(state)
  saveState(next)
  return next
}

/** Set the active workspace and persist it. */
export function setActiveWorkspace(targetPath: string): WorkspaceState {
  const state = readState()
  if (state.workspaces.some((w) => w.path === targetPath)) {
    state.activePath = targetPath
  }
  const next = normalize(state)
  saveState(next)
  return next
}
