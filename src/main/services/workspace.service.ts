import { app, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { Workspace } from '@shared/types'

function storeFile(): string {
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

function saveLastWorkspace(ws: Workspace): void {
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(ws, null, 2), 'utf-8')
  } catch (err) {
    console.error('[workspace] failed to persist workspace:', err)
  }
}

/**
 * Open the native directory picker. Returns the chosen + persisted Workspace,
 * or null if the user cancelled.
 * @throws Error with a friendly message if the chosen path is not a valid directory.
 */
export async function openWorkspaceDialog(): Promise<Workspace | null> {
  const result = await dialog.showOpenDialog({
    title: 'Open from folder',
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const dir = result.filePaths[0]
  if (!isValidWorkspaceDir(dir)) {
    throw new Error('The selected path is not a valid folder.')
  }

  const ws: Workspace = {
    path: dir,
    name: path.basename(dir) || dir,
    lastOpenedAt: Date.now()
  }
  saveLastWorkspace(ws)
  return ws
}

/**
 * Read the last persisted workspace. Returns null if none stored or if the
 * stored folder no longer exists on disk.
 */
export function getLastWorkspace(): Workspace | null {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf-8')
    const ws = JSON.parse(raw) as Workspace
    if (!ws?.path || !isValidWorkspaceDir(ws.path)) return null
    return ws
  } catch {
    return null
  }
}
