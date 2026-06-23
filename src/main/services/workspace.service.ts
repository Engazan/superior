import { dialog } from 'electron'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type {
  Folder,
  FolderUpdate,
  Profile,
  Workspace,
  WorkspaceState,
  WorktreeAddArgs
} from '@shared/types'
import { userDataFile, writeJsonFile } from '../lib/jsonStore'
import {
  createWorktree,
  existingWorktreePaths,
  pruneWorktrees,
  removeWorktree
} from './worktree.service'

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

/** Canonical absolute path with symlinks resolved; falls back to a plain resolve
 * for paths that don't exist yet (the subsequent read fails on its own). */
export function canonicalPath(p: string): string {
  try {
    return fs.realpathSync(path.resolve(p))
  } catch {
    return path.resolve(p)
  }
}

// Canonical roots the renderer may reach: opened folders PLUS the worktree
// directories of worktree-backed workspaces (which live outside any folder).
// Cached so containment checks don't re-read/parse workspaces.json on every
// filesystem call. Always refreshed by saveState, so it self-invalidates after
// any worktree create/remove — no separate invalidation needed.
let cachedAllowedRoots: string[] | null = null

/** Canonical folder roots + persisted worktree paths. */
function computeAllowedRoots(state: WorkspaceState): string[] {
  const folders = state.folders.map((f) => canonicalPath(f.path))
  const worktrees = state.workspaces
    .map((w) => w.worktreePath)
    .filter((p): p is string => !!p)
    .map(canonicalPath)
  return [...folders, ...worktrees]
}

function allowedRoots(): string[] {
  if (!cachedAllowedRoots) {
    cachedAllowedRoots = computeAllowedRoots(readState())
  }
  return cachedAllowedRoots
}

/**
 * True if `target` resolves to — or inside — an opened folder or a registered
 * worktree directory. Defense-in-depth: filesystem reads from the renderer must
 * stay within a known root, so a bug or compromised renderer can't enumerate
 * arbitrary paths. Paths are canonicalized (symlinks resolved) so a symlink
 * inside a root can't escape, and worktree paths are allowlisted only once
 * persisted on a workspace we created — never arbitrary widening.
 */
export function isWithinWorkspaceFolder(target: string): boolean {
  const resolved = canonicalPath(target)
  return allowedRoots().some(
    (root) => resolved === root || resolved.startsWith(root + path.sep)
  )
}

const DEFAULT_PROFILE_NAME = 'Default'

function makeProfile(name: string): Profile {
  return { id: randomUUID(), name: name.trim() || 'Profile', createdAt: Date.now() }
}

function makeFolder(dir: string, profileId: string): Folder {
  return { path: dir, name: path.basename(dir) || dir, profileId, lastOpenedAt: Date.now() }
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
        profiles: Array.isArray(parsed.profiles) ? (parsed.profiles as Profile[]) : [],
        activeProfileId: (parsed.activeProfileId as string | null) ?? null,
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
  // normalize seeds the Default profile and assigns these folders to it.
  return normalize({ profiles: [], activeProfileId: null, folders, workspaces, activeWorkspaceId })
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
  return normalize({ profiles: [], activeProfileId: null, folders: [], workspaces: [], activeWorkspaceId: null })
}

/**
 * Guarantee at least one profile, a valid activeProfileId, and that every folder
 * carries a profileId. Legacy folders (no profileId) and folders pointing at a
 * deleted profile are adopted by the active profile, so nothing is orphaned.
 */
function ensureProfiles(state: WorkspaceState): WorkspaceState {
  const profiles = state.profiles.length ? [...state.profiles] : [makeProfile(DEFAULT_PROFILE_NAME)]
  const valid = new Set(profiles.map((p) => p.id))
  const activeProfileId =
    state.activeProfileId && valid.has(state.activeProfileId)
      ? state.activeProfileId
      : profiles[0].id
  const folders = state.folders.map((f) =>
    f.profileId && valid.has(f.profileId) ? f : { ...f, profileId: activeProfileId }
  )
  return { ...state, profiles, activeProfileId, folders }
}

/**
 * Keep the persisted invariants: a seeded profile set, and an activeWorkspaceId
 * that points at an existing workspace *within the active profile* (or null).
 * The sidebar only renders the active profile's folders, so the active workspace
 * must live there too.
 */
function normalize(state: WorkspaceState): WorkspaceState {
  const s = ensureProfiles(state)
  const profilePaths = new Set(
    s.folders.filter((f) => f.profileId === s.activeProfileId).map((f) => f.path)
  )
  const inProfile = (id: string | null): boolean => {
    const ws = id ? s.workspaces.find((w) => w.id === id) : undefined
    return !!ws && profilePaths.has(ws.folderPath)
  }
  let activeWorkspaceId = s.activeWorkspaceId
  if (!inProfile(activeWorkspaceId)) {
    const candidates = s.workspaces.filter((w) => profilePaths.has(w.folderPath))
    activeWorkspaceId = candidates.length ? candidates[candidates.length - 1].id : null
  }
  return {
    profiles: s.profiles,
    activeProfileId: s.activeProfileId,
    folders: s.folders,
    workspaces: s.workspaces,
    activeWorkspaceId
  }
}

function saveState(state: WorkspaceState): void {
  cachedAllowedRoots = computeAllowedRoots(state)
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
    // New folders join the active profile; existing ones keep their profile but
    // switch the active profile to the one that owns them so they're visible.
    state.folders.push(makeFolder(dir, state.activeProfileId as string))
    const ws = makeWorkspace(dir, 'Main')
    state.workspaces.push(ws)
    state.activeWorkspaceId = ws.id
  } else {
    existing.lastOpenedAt = Date.now()
    // Re-opening a folder filed under another profile activates that profile so
    // the folder (and its newly-active workspace) is actually shown.
    if (existing.profileId) state.activeProfileId = existing.profileId
    const ws = state.workspaces.find((w) => w.folderPath === dir)
    if (ws) state.activeWorkspaceId = ws.id
  }

  const next = normalize(state)
  saveState(next)
  return next
}

/**
 * Create a new profile and switch to it (its folder list starts empty). The
 * caller then opens folders into it. Returns the updated state.
 */
export function addProfile(name: string): WorkspaceState {
  const state = readState()
  const profile = makeProfile(name)
  state.profiles.push(profile)
  state.activeProfileId = profile.id
  const next = normalize(state)
  saveState(next)
  return next
}

/** Rename a profile. */
export function renameProfile(id: string, name: string): WorkspaceState {
  const state = readState()
  const profile = state.profiles.find((p) => p.id === id)
  if (profile) profile.name = name.trim() || profile.name
  const next = normalize(state)
  saveState(next)
  return next
}

/**
 * Remove a profile along with all of its folders and their workspaces, tearing
 * down any worktrees. The last remaining profile can't be removed (there must
 * always be one). If the active profile is removed, another becomes active.
 */
export async function removeProfile(id: string): Promise<WorkspaceState> {
  const state = readState()
  if (state.profiles.length <= 1 || !state.profiles.some((p) => p.id === id)) {
    return normalize(state)
  }
  const doomedPaths = new Set(state.folders.filter((f) => f.profileId === id).map((f) => f.path))
  const doomed = state.workspaces.filter((w) => doomedPaths.has(w.folderPath) && w.worktreePath)
  await Promise.allSettled(
    doomed.map((w) => removeWorktree(w.folderPath, w.worktreePath as string, { force: true }))
  )
  state.folders = state.folders.filter((f) => f.profileId !== id)
  state.workspaces = state.workspaces.filter((w) => !doomedPaths.has(w.folderPath))
  state.profiles = state.profiles.filter((p) => p.id !== id)
  if (state.activeProfileId === id) state.activeProfileId = state.profiles[0]?.id ?? null
  const next = normalize(state)
  saveState(next)
  return next
}

/** Switch the active profile; normalize re-points the active workspace into it. */
export function setActiveProfile(id: string): WorkspaceState {
  const state = readState()
  if (state.profiles.some((p) => p.id === id)) state.activeProfileId = id
  const next = normalize(state)
  saveState(next)
  return next
}

/** Remove a folder and all of its workspaces, tearing down any worktrees. */
export async function removeFolder(folderPath: string): Promise<WorkspaceState> {
  const state = readState()
  // Best-effort: drop app-managed worktrees of this folder's workspaces so they
  // don't leak. Folder removal is a deliberate destructive action, so force.
  const doomed = state.workspaces.filter((w) => w.folderPath === folderPath && w.worktreePath)
  await Promise.allSettled(
    doomed.map((w) => removeWorktree(folderPath, w.worktreePath as string, { force: true }))
  )
  state.folders = state.folders.filter((f) => f.path !== folderPath)
  state.workspaces = state.workspaces.filter((w) => w.folderPath !== folderPath)
  const next = normalize(state)
  saveState(next)
  return next
}

/**
 * Reorder folders to match the given list of paths. Paths are applied in the
 * order received; any folder omitted from the list (e.g. added concurrently)
 * keeps its relative position by being appended afterwards. Unknown paths are
 * ignored. Workspaces and the active selection are untouched.
 */
export function reorderFolders(orderedPaths: string[]): WorkspaceState {
  const state = readState()
  const byPath = new Map(state.folders.map((f) => [f.path, f]))
  const reordered: Folder[] = []
  const seen = new Set<string>()
  for (const p of orderedPaths) {
    const folder = byPath.get(p)
    if (folder && !seen.has(p)) {
      reordered.push(folder)
      seen.add(p)
    }
  }
  // Preserve any folders the caller didn't mention, in their existing order.
  for (const f of state.folders) {
    if (!seen.has(f.path)) reordered.push(f)
  }
  state.folders = reordered
  const next = normalize(state)
  saveState(next)
  return next
}

/**
 * Update a folder's display name and/or custom icon. The folder's path is
 * immutable — only its visuals change. A field set to null clears it (falling
 * back to the basename / default glyph); undefined leaves it untouched.
 */
export function updateFolder(folderPath: string, patch: FolderUpdate): WorkspaceState {
  const state = readState()
  const folder = state.folders.find((f) => f.path === folderPath)
  if (folder) {
    if (patch.displayName !== undefined) {
      const trimmed = patch.displayName?.trim()
      if (trimmed) folder.displayName = trimmed
      else delete folder.displayName
    }
    if (patch.icon !== undefined) {
      if (patch.icon) folder.icon = patch.icon
      else delete folder.icon
    }
    if (patch.color !== undefined) {
      if (patch.color) folder.color = patch.color
      else delete folder.color
    }
    if (patch.collapsed !== undefined) {
      if (patch.collapsed) folder.collapsed = true
      else delete folder.collapsed
    }
  }
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

/**
 * Create a git worktree (new or existing branch) and a workspace bound to it,
 * then make it active. Rolls the worktree back if persistence is impossible.
 * @throws a WORKTREE_ERROR code or raw git error (handled by the IPC layer).
 */
export async function addWorktreeWorkspace(args: WorktreeAddArgs): Promise<WorkspaceState> {
  const state = readState()
  if (!state.folders.some((f) => f.path === args.folderPath)) {
    throw new Error('worktree:invalid-folder')
  }

  const { worktreePath, branch } = await createWorktree(
    args.folderPath,
    args.branch.trim(),
    args.createBranch
  )

  try {
    const ws: Workspace = {
      ...makeWorkspace(args.folderPath, args.name.trim() || branch),
      worktreePath,
      branch
    }
    state.workspaces.push(ws)
    state.activeWorkspaceId = ws.id
    const next = normalize(state)
    saveState(next)
    return next
  } catch (err) {
    // Persistence failed after the worktree was created — don't leak it.
    await removeWorktree(args.folderPath, worktreePath, { force: true }).catch(() => undefined)
    throw err
  }
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

/**
 * Remove a workspace. The folder is kept even if it becomes empty. A
 * worktree-backed workspace also tears down its worktree; without `force` git
 * refuses to remove a dirty tree, so the call rejects and the workspace is left
 * intact (the UI confirms, then retries with force).
 */
export async function removeWorkspace(id: string, force = false): Promise<WorkspaceState> {
  const state = readState()
  const removed = state.workspaces.find((w) => w.id === id)
  // Tear the worktree down first; if it fails (dirty + !force), don't mutate state.
  if (removed?.worktreePath) {
    await removeWorktree(removed.folderPath, removed.worktreePath, { force })
  }
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

/** Delete app-managed worktree dirs no longer referenced by any workspace. */
function cleanOrphanWorktreeDirs(state: WorkspaceState): void {
  const root = userDataFile('worktrees')
  let buckets: string[]
  try {
    buckets = fs.readdirSync(root)
  } catch {
    return // no worktrees dir yet
  }
  const referenced = new Set(
    state.workspaces
      .map((w) => w.worktreePath)
      .filter((p): p is string => !!p)
      .map(canonicalPath)
  )
  for (const bucket of buckets) {
    const bucketPath = path.join(root, bucket)
    let children: string[]
    try {
      children = fs.readdirSync(bucketPath)
    } catch {
      continue
    }
    for (const child of children) {
      const dir = path.join(bucketPath, child)
      if (!referenced.has(canonicalPath(dir))) {
        try {
          fs.rmSync(dir, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
    }
    try {
      if (fs.readdirSync(bucketPath).length === 0) fs.rmdirSync(bucketPath)
    } catch {
      /* not empty / gone */
    }
  }
}

/**
 * On startup, reconcile persisted worktree-backed workspaces against git's
 * actual worktree list: prune stale git admin entries, revert any workspace
 * whose worktree directory has vanished back to its repo root (so agents never
 * launch in a stale cwd), and delete orphan app-managed dirs. Never throws.
 * Returns warnings for workspaces that were reverted.
 */
export async function reconcileWorktrees(): Promise<string[]> {
  const warnings: string[] = []
  let state: WorkspaceState
  try {
    state = readState()
  } catch {
    return warnings
  }

  const folders = [...new Set(state.workspaces.filter((w) => w.worktreePath).map((w) => w.folderPath))]
  const existingByFolder = new Map<string, Set<string>>()
  for (const folder of folders) {
    await pruneWorktrees(folder)
    existingByFolder.set(folder, await existingWorktreePaths(folder))
  }

  for (const ws of state.workspaces) {
    if (!ws.worktreePath) continue
    const existing = existingByFolder.get(ws.folderPath)
    if (!existing || !existing.has(canonicalPath(ws.worktreePath))) {
      warnings.push(`Worktree for "${ws.name}" is missing; reverted to the repo root.`)
      delete ws.worktreePath
      delete ws.branch
    }
  }

  cleanOrphanWorktreeDirs(state)
  saveState(normalize(state)) // also refreshes the containment allowlist cache
  return warnings
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
