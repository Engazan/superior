import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import { existsSync, readFileSync } from 'fs'
import { isAbsolute } from 'path'
import {
  MOBILE_ACTIONS,
  type CatalogRow,
  type MobileCatalog,
  type MobileMutation,
  type MobileSession,
} from '@shared/mobileRelay'
import { IPC } from '@shared/types'
import { userDataFile, writeJsonFile } from '../lib/jsonStore'
import {
  MobileOperations,
  type StoredMobileOperation,
} from './mobileOperations'
import * as workspace from './workspace.service'
import { daemonClient } from './daemonClient'
import { getAgentStates } from './agent-state.service'
import { listPresets } from './presets.service'
import { getTabs, setTabs } from './layout.service'
import { startAgent, killAgent } from './agent.service'
import { getAccountUsage, listUsageProfiles } from './account-usage.service'
import { getSetupState } from './worktree-setup.service'
import { isWorktreeDirty, listBranches } from './worktree.service'
import { readTranscript } from './mobileTranscript'

let operations: MobileOperations | undefined
let mutationQueue: Promise<unknown> = Promise.resolve()
const snapshots = new Map<
  string,
  { token: string; rows: CatalogRow[]; expires: number }
>()
function ledger(): MobileOperations {
  return (operations ??= new MobileOperations(
    () => {
      const file = userDataFile('mobile-operations.json')
      if (!existsSync(file)) return []
      const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
      if (
        !Array.isArray(value) ||
        !value.every(
          (entry) =>
            entry &&
            typeof entry.deviceId === 'string' &&
            typeof entry.requestId === 'string' &&
            typeof entry.fingerprint === 'string' &&
            ['running', 'done', 'failed', 'uncertain'].includes(entry.state) &&
            Number.isFinite(entry.startedAt),
        )
      )
        throw new Error('operation_store_corrupt')
      return value as StoredMobileOperation[]
    },
    (entries) =>
      writeJsonFile(
        userDataFile('mobile-operations.json'),
        entries,
        'mobile operations',
      ),
  ))
}
function text(value: unknown, max = 1000): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new Error('invalid_request')
  return value.trim()
}
function color(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error('invalid_color')
  return value
}
function publish(): void {
  for (const win of BrowserWindow.getAllWindows())
    if (!win.isDestroyed())
      win.webContents.send(IPC.WORKSPACE_STATE_CHANGED, {
        ...workspace.listWorkspaces(),
        source: 'mobile',
      })
}
export async function mobileSessions(): Promise<MobileSession[]> {
  const states = new Map(
    getAgentStates().map((state) => [state.id, state.state]),
  )
  return (await daemonClient.list()).map((s) => ({
    id: s.id,
    workspaceId: s.meta.workspaceId,
    tabId: s.meta.tabId,
    label: s.meta.label.slice(0, 128),
    nickname: s.meta.nickname?.slice(0, 128),
    cols: s.cols,
    rows: s.rows,
    createdAt: s.meta.createdAt,
    status: s.status,
    agentState: states.get(s.id) ?? 'unknown',
  }))
}
async function catalog(): Promise<MobileCatalog> {
  const state = workspace.listWorkspaces()
  return {
    profiles: state.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
    })),
    projects: state.folders.map((f) => ({
      path: f.path,
      profileId: f.profileId!,
      name: f.displayName || f.name,
      color: f.color,
      kind: f.kind ?? 'local',
    })),
    workspaces: state.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      folderPath: w.folderPath,
      branch: w.branch,
      worktree: !!w.worktreePath,
      setup: getSetupState(w)?.status,
    })),
    sessions: await mobileSessions(),
    presets: listPresets()
      .presets.filter((p) => p.active)
      .map((p) => ({ id: p.id, name: p.name, color: p.color })),
    tabs: Object.entries(getTabs()).flatMap(([workspaceId, value]) =>
      value.tabs.map((tab) => ({ id: tab.id, name: tab.name, workspaceId })),
    ),
  }
}
function target(msg: Record<string, unknown>) {
  const state = workspace.listWorkspaces()
  const folders =
    msg.type === 'profiles.remove'
      ? state.folders.filter((f) => f.profileId === msg.id)
      : msg.type === 'projects.remove'
        ? state.folders.filter((f) => f.path === msg.path)
        : []
  const paths = new Set(folders.map((f) => f.path))
  const doomed =
    msg.type === 'workspaces.remove'
      ? state.workspaces.filter((w) => w.id === msg.id)
      : state.workspaces.filter((w) => paths.has(w.folderPath))
  if (
    !doomed.length &&
    !folders.length &&
    !state.profiles.some(
      (p) => msg.type === 'profiles.remove' && p.id === msg.id,
    )
  )
    throw new Error('not_found')
  return { folders, doomed }
}
async function preview(msg: Record<string, unknown>) {
  const { doomed } = target(msg)
  const dirty = await Promise.all(
    doomed
      .filter((w) => w.worktreePath)
      .map(async (w) => ({
        id: w.id,
        name: w.name,
        dirty: await isWorktreeDirty(w.worktreePath!),
      })),
  )
  const ids = new Set(doomed.map((w) => w.id))
  const sessions = (await mobileSessions()).filter((s) =>
    ids.has(s.workspaceId),
  )
  return { worktrees: dirty, sessions }
}
async function mutate(
  msg: Record<string, unknown>,
): Promise<{ sessionId?: string } | undefined> {
  const state = workspace.listWorkspaces()
  const profile = () => {
    const p = state.profiles.find((p) => p.id === msg.id)
    if (!p) throw new Error('not_found')
    return p
  }
  const project = () => {
    const f = state.folders.find((f) => f.path === msg.path)
    if (!f) throw new Error('not_found')
    return f
  }
  const ws = () => {
    const w = state.workspaces.find((w) => w.id === (msg.id ?? msg.workspaceId))
    if (!w) throw new Error('not_found')
    return w
  }
  switch (msg.type) {
    case 'profiles.create':
      workspace.addProfile(text(msg.name), false)
      break
    case 'profiles.rename':
      workspace.renameProfile(profile().id, text(msg.name))
      break
    case 'profiles.color':
      workspace.updateProfile(profile().id, { color: color(msg.color) })
      break
    case 'projects.add': {
      const path = text(msg.path, 4096)
      if (
        !state.profiles.some((p) => p.id === msg.profileId) ||
        !isAbsolute(path) ||
        !workspace.isValidWorkspaceDir(path)
      )
        throw new Error('invalid_path')
      workspace.addFolderByPath(workspace.canonicalPath(path), {
        profileId: text(msg.profileId),
        activate: false,
      })
      break
    }
    case 'projects.update':
      workspace.updateFolder(project().path, {
        ...(msg.name !== undefined ? { displayName: text(msg.name) } : {}),
        ...(msg.color !== undefined ? { color: color(msg.color) } : {}),
      })
      break
    case 'workspaces.create':
      workspace.addWorkspace(project().path, text(msg.name), false)
      break
    case 'workspaces.rename':
      workspace.renameWorkspace(ws().id, text(msg.name))
      break
    case 'worktrees.create': {
      const folder = project()
      if (folder.kind === 'remote' || typeof msg.createBranch !== 'boolean')
        throw new Error('unsupported_project')
      await workspace.addWorktreeWorkspace(
        {
          folderPath: folder.path,
          name: text(msg.name),
          branch: text(msg.branch),
          createBranch: msg.createBranch,
        },
        false,
      )
      break
    }
    case 'profiles.remove':
    case 'projects.remove':
    case 'workspaces.remove': {
      if (
        msg.confirmed !== true ||
        (msg.force !== undefined && typeof msg.force !== 'boolean')
      )
        throw new Error('confirmation_required')
      if (
        msg.type === 'profiles.remove' &&
        (profile(), state.profiles.length <= 1)
      )
        throw new Error('last_profile')
      const { doomed } = target(msg)
      const details = await preview(msg)
      if (details.worktrees.some((w) => w.dirty) && !msg.force)
        throw new Error('dirty_worktree')
      // No unconfirmed cascade into forced profile/folder deletion.
      for (const session of details.sessions) await killAgent(session.id)
      for (const item of doomed)
        await workspace.removeWorkspace(item.id, msg.force === true)
      if (msg.type === 'projects.remove')
        await workspace.removeFolder(project().path)
      if (msg.type === 'profiles.remove')
        await workspace.removeProfile(profile().id)
      break
    }
    case 'terminals.create': {
      const item = ws()
      const folder = state.folders.find((f) => f.path === item.folderPath)!
      const preset = listPresets().presets.find(
        (p) => p.id === msg.presetId && p.active,
      )
      if (!preset) throw new Error('invalid_preset')
      const tabs = getTabs()[item.id] ?? { tabs: [], activeTabId: '' }
      let tabId =
        typeof msg.tabId === 'string'
          ? msg.tabId
          : tabs.activeTabId || tabs.tabs[0]?.id
      if (tabId && !tabs.tabs.some((t) => t.id === tabId))
        throw new Error('invalid_tab')
      if (!tabId) {
        tabId = randomUUID()
        setTabs(item.id, {
          tabs: [{ id: tabId, name: 'Tab 1' }],
          activeTabId: tabId,
        })
      }
      const cwd = item.worktreePath || folder.path
      const result = await startAgent({
        command: preset.command,
        label: preset.name,
        workspaceId: item.id,
        tabId,
        cwd,
        launchTarget:
          folder.kind === 'remote' && folder.remote
            ? { kind: 'remote', ...folder.remote }
            : { kind: 'local', cwd },
        iconType: preset.iconType,
        icon: preset.icon,
        color: preset.color,
        cols: 80,
        rows: 24,
      })
      if ('error' in result) throw new Error('launch_failed')
      return { sessionId: result.session.id }
    }
    case 'terminals.kill': {
      if (
        msg.confirmed !== true ||
        !(await mobileSessions()).some((s) => s.id === msg.sessionId)
      )
        throw new Error('invalid_session')
      await killAgent(text(msg.sessionId))
      break
    }
    default:
      throw new Error('unsupported_action')
  }
}
/** Returns null for legacy streaming messages handled by the relay service. */
export async function handleMobileBridge(
  deviceId: string,
  msg: Record<string, unknown>,
  authorized: () => boolean = () => true,
): Promise<object | null> {
  if (msg.type === 'capabilities.get')
    return {
      type: 'capabilities',
      protocol: 2,
      desktopVersion: app.getVersion(),
      hostName: hostname(),
      actions: MOBILE_ACTIONS,
    }
  if (msg.type === 'catalog.get') {
    let snapshot = snapshots.get(deviceId)
    const offset = msg.offset === undefined ? 0 : msg.offset
    if (!Number.isSafeInteger(offset) || (offset as number) < 0)
      throw new Error('invalid_cursor')
    if (!msg.token) {
      const data = await catalog()
      const rows = Object.entries(data).flatMap(([kind, values]) =>
        values.map((value: unknown) => ({ kind, value })),
      ) as CatalogRow[]
      snapshot = { token: randomUUID(), rows, expires: Date.now() + 60_000 }
      snapshots.set(deviceId, snapshot)
    }
    if (
      !snapshot ||
      snapshot.token !== (msg.token ?? snapshot.token) ||
      snapshot.expires < Date.now()
    )
      throw new Error('expired_cursor')
    const rows: CatalogRow[] = []
    let bytes = 0
    let index = offset as number
    while (index < snapshot.rows.length) {
      const row = snapshot.rows[index]
      const length = Buffer.byteLength(JSON.stringify(row))
      if (length > 40_000) throw new Error('metadata_too_large')
      if (bytes + length > 50_000) break
      rows.push(row)
      bytes += length
      index++
    }
    return {
      type: 'catalog.page',
      rows,
      token: snapshot.token,
      nextOffset: index < snapshot.rows.length ? index : null,
    }
  }
  if (msg.type === 'usage.get') {
    const profiles = listUsageProfiles()
    const offset =
      typeof msg.offset === 'number' &&
      Number.isSafeInteger(msg.offset) &&
      msg.offset >= 0
        ? msg.offset
        : 0
    const page = profiles.slice(offset, offset + 20)
    const values = await getAccountUsage(
      page.map((p) => p.id),
      msg.force === true,
    )
    return {
      type: 'usage',
      list: values.map((value) => {
        const profile = page.find((p) => p.id === value.profileId)!
        return {
          id: profile.id,
          name: profile.name,
          provider: profile.provider,
          status: value.status,
          plan: value.plan,
          windows: value.windows,
          updatedAt: value.updatedAt,
          resetCredits: value.resetCredits
            ? { availableCount: value.resetCredits.availableCount }
            : null,
        }
      }),
      nextOffset:
        offset + page.length < profiles.length ? offset + page.length : null,
    }
  }
  if (msg.type === 'transcript.get') {
    const sessionId = text(msg.sessionId, 80)
    if (!(await mobileSessions()).some((s) => s.id === sessionId))
      throw new Error('invalid_session')
    const offset = msg.offset === undefined ? undefined : msg.offset
    if (offset !== undefined && (!Number.isSafeInteger(offset) || (offset as number) < 0))
      throw new Error('invalid_cursor')
    const transcriptId =
      msg.transcriptId === undefined ? undefined : text(msg.transcriptId, 80)
    return {
      type: 'transcript',
      ...readTranscript(sessionId, offset as number | undefined, transcriptId),
    }
  }
  if (msg.type === 'branches.list') {
    const folder = workspace
      .listWorkspaces()
      .folders.find((f) => f.path === msg.path && f.kind !== 'remote')
    if (!folder) throw new Error('invalid_project')
    const branches = await listBranches(folder.path)
    const offset =
      typeof msg.offset === 'number' &&
      Number.isSafeInteger(msg.offset) &&
      msg.offset >= 0
        ? msg.offset
        : 0
    return {
      type: 'branches',
      list: branches.slice(offset, offset + 100),
      nextOffset: offset + 100 < branches.length ? offset + 100 : null,
    }
  }
  if (msg.type === 'removal.preview') {
    const payload = msg.target
    if (
      !payload ||
      typeof payload !== 'object' ||
      !['profiles.remove', 'projects.remove', 'workspaces.remove'].includes(
        String((payload as Record<string, unknown>).type),
      )
    )
      throw new Error('invalid_request')
    const details = await preview(payload as Record<string, unknown>)
    return {
      type: 'removal',
      sessionCount: details.sessions.length,
      workspaceCount: target(payload as Record<string, unknown>).doomed.length,
      dirty: details.worktrees.some((w) => w.dirty),
      worktrees: details.worktrees
        .filter((w) => w.dirty)
        .slice(0, 50)
        .map((w) => ({ name: w.name.slice(0, 128) })),
    }
  }
  if (msg.type === 'operations.get')
    return {
      type: 'operation',
      operation: ledger().get(deviceId, text(msg.operationId, 80)) ?? null,
    }
  if (
    (MOBILE_ACTIONS as readonly string[]).includes(String(msg.type)) &&
    !String(msg.type).endsWith('.get')
  ) {
    const requestId = text(msg.requestId, 80)
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new Error('invalid_request')
    const { v: _v, seq: _seq, requestId: _requestId, ...payload } = msg
    const operation = ledger().start(
      deviceId,
      requestId,
      payload as MobileMutation,
      async () => {
        const task = mutationQueue.catch(() => {}).then(() => {
          if (!authorized()) throw new Error('device_revoked')
          return mutate(payload)
        })
        mutationQueue = task
        return task
      },
      publish,
    )
    return { type: 'operation', operation }
  }
  return null
}
