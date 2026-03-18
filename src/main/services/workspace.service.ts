import { dialog } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type { Folder, Workspace, WorkspaceState } from '@shared/types'
import { userDataFile, writeJsonFile } from '../lib/jsonStore'

function storeFile(): string {
  return userDataFile('workspaces.json')
}

function legacyFile(): string {
  return userDataFile('workspace.json')
}

/** True if the path exists and is a directory. */
export function isValidWorkspaceDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/**
 * True if `target` resolves to — or inside — one of the saved workspace folders.
 * Defense-in-depth: filesystem reads from the renderer must stay within an opened
 * folder, so a bug or compromised renderer can't enumerate arbitrary paths.
 */
export function isWithinWorkspaceFolder(target: string): boolean {
  const resolved = path.resolve(target)
  return readState().folders.some((f) => {
    const root = path.resolve(f.path)
    return resolved === root || resolved.startsWith(root + path.sep)
  })
}

function makeFolder(dir: string): Folder {
  return { path: dir, name: path.basename(dir) || dir, lastOpenedAt: Date.now() }
}

function makeWorkspace(folderPath: string, name: string): Workspace {
  return { id: randomUUID(), folderPath, name, createdAt: Date.now() }
}

/** Read raw state from disk, migrating older formats if needed. */
function readState(): WorkspaceState {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (Array.isArray(parsed.folders)) {
      return normalize({
        folders: parsed.folders as Folder[],
        workspaces: Array.isArray(parsed.workspaces) ? (parsed.workspaces as Workspace[]) : [],
        activeWorkspaceId: (parsed.activeWorkspaceId as string | null) ?? null
      })
    }
    // Old shape: { workspaces: [{ path, name }], activePath }
    return migrateFolders(
      Array.isArray(parsed.workspaces) ? (parsed.workspaces as Folder[]) : [],
      (parsed.activePath as string | null) ?? null
    )
  } catch {
    return migrateLegacy()
  }
}

/** Convert a flat list of folder-workspaces into the folder + workspace model. */
function migrateFolders(oldFolders: Folder[], activePath: string | null): WorkspaceState {
  const folders: Folder[] = []
  const workspaces: Workspace[] = []
  let activeWorkspaceId: string | null = null
  for (const f of oldFolders) {
    if (!f?.path) continue
    folders.push({ path: f.path, name: f.name ?? path.basename(f.path), lastOpenedAt: f.lastOpenedAt ?? Date.now() })
    const ws = makeWorkspace(f.path, 'Main')
    workspaces.push(ws)
    if (f.path === activePath) activeWorkspaceId = ws.id
  }
  return normalize({ folders, workspaces, activeWorkspaceId })
}

/** If an old single-workspace file exists, seed from it (best effort). */
function migrateLegacy(): WorkspaceState {
  try {
    const raw = fs.readFileSync(legacyFile(), 'utf-8')
    const ws = JSON.parse(raw) as { path?: string; name?: string }
    if (ws?.path) {
      return migrateFolders([{ path: ws.path, name: ws.name ?? path.basename(ws.path), lastOpenedAt: Date.now() }], ws.path)
    }
  } catch {
    /* no legacy file */
  }
  return { folders: [], workspaces: [], activeWorkspaceId: null }
}

/** Keep activeWorkspaceId pointing at an existing workspace (or null). */
function normalize(state: WorkspaceState): WorkspaceState {
  const has = (id: string | null): boolean => !!id && state.workspaces.some((w) => w.id === id)
  const activeWorkspaceId = has(state.activeWorkspaceId)
    ? state.activeWorkspaceId
    : state.workspaces.length
      ? state.workspaces[state.workspaces.length - 1].id
      : null
  return { folders: state.folders, workspaces: state.workspaces, activeWorkspaceId }
}

function saveState(state: WorkspaceState): void {
  writeJsonFile(storeFile(), state, 'workspace')
}

/** Return all saved folders + workspaces and the active selection. */
export function listWorkspaces(): WorkspaceState {
  return readState()
}

/**
 * Open the native directory picker and add the chosen folder. A brand-new folder
 * also gets a default workspace. Re-opening a known folder just re-activates one of
 * its workspaces. Returns the updated state, or null if the user cancelled.
 * @throws Error if the chosen path is not a valid directory.
 */
export async function addFolder(): Promise<WorkspaceState | null> {
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
  const existing = state.folders.find((f) => f.path === dir)
  if (!existing) {
    state.folders.push(makeFolder(dir))
    const ws = makeWorkspace(dir, 'Main')
    state.workspaces.push(ws)
    state.activeWorkspaceId = ws.id
  } else {
    existing.lastOpenedAt = Date.now()
    const ws = state.workspaces.find((w) => w.folderPath === dir)
    if (ws) state.activeWorkspaceId = ws.id
  }

  const next = normalize(state)
  saveState(next)
  return next
}

/** Remove a folder and all of its workspaces. */
export function removeFolder(folderPath: string): WorkspaceState {
  const state = readState()
  state.folders = state.folders.filter((f) => f.path !== folderPath)
  state.workspaces = state.workspaces.filter((w) => w.folderPath !== folderPath)
  const next = normalize(state)
  saveState(next)
  return next
}

/** Create a new workspace under a folder and make it active. */
export function addWorkspace(folderPath: string, name: string): WorkspaceState {
  const state = readState()
  if (state.folders.some((f) => f.path === folderPath)) {
    const ws = makeWorkspace(folderPath, name.trim() || 'Workspace')
    state.workspaces.push(ws)
    state.activeWorkspaceId = ws.id
  }
  const next = normalize(state)
  saveState(next)
  return next
}

/** Rename a workspace. */
export function renameWorkspace(id: string, name: string): WorkspaceState {
  const state = readState()
  const ws = state.workspaces.find((w) => w.id === id)
  if (ws) ws.name = name.trim() || ws.name
  const next = normalize(state)
  saveState(next)
  return next
}

/** Remove a workspace. The folder is kept even if it becomes empty. */
export function removeWorkspace(id: string): WorkspaceState {
  const state = readState()
  const removed = state.workspaces.find((w) => w.id === id)
  state.workspaces = state.workspaces.filter((w) => w.id !== id)
  if (state.activeWorkspaceId === id) {
    const sameFolder = state.workspaces.filter((w) => w.folderPath === removed?.folderPath)
    state.activeWorkspaceId = sameFolder.length
      ? sameFolder[sameFolder.length - 1].id
      : null
  }
  const next = normalize(state)
  saveState(next)
  return next
}

/** Set the active workspace and persist it. */
export function setActiveWorkspace(id: string): WorkspaceState {
  const state = readState()
  if (state.workspaces.some((w) => w.id === id)) {
    state.activeWorkspaceId = id
  }
  const next = normalize(state)
  saveState(next)
  return next
}
