import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
const m = vi.hoisted(() => ({
  state: {
    profiles: [{ id: 'profile', name: 'Default' }],
    activeProfileId: 'profile',
    folders: [
      {
        path: '/project',
        name: 'Project',
        profileId: 'profile',
        kind: 'local',
      },
    ],
    workspaces: [{ id: 'workspace', folderPath: '/project', name: 'Main' }],
    activeWorkspaceId: 'workspace',
  },
  sessions: [
    {
      id: 'session',
      cols: 80,
      rows: 24,
      status: 'running',
      meta: {
        workspaceId: 'workspace',
        label: 'Shell',
        createdAt: 1,
        command: 'private-command',
      },
    },
  ],
  addProfile: vi.fn(),
  addFolder: vi.fn(),
  start: vi.fn(),
  kill: vi.fn(),
  remove: vi.fn(),
  dirty: vi.fn(),
  usage: vi.fn(),
  publish: vi.fn(),
  save: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getVersion: () => 'test' },
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: m.publish } },
    ],
  },
}))
vi.mock('../lib/jsonStore', () => ({
  userDataFile: () => '/nonexistent/superior-mobile-operations-test.json',
  writeJsonFile: m.save,
}))
vi.mock('./workspace.service', () => ({
  listWorkspaces: () => m.state,
  addProfile: m.addProfile,
  addFolderByPath: m.addFolder,
  isValidWorkspaceDir: () => true,
  canonicalPath: (p: string) => p,
  removeWorkspace: m.remove,
  removeFolder: vi.fn(),
  removeProfile: vi.fn(),
}))
vi.mock('./daemonClient', () => ({
  daemonClient: { list: async () => m.sessions },
}))
vi.mock('./agent-state.service', () => ({ getAgentStates: () => [] }))
vi.mock('./presets.service', () => ({
  listPresets: () => ({
    presets: [
      { id: 'shell', name: 'Shell', active: true, command: 'trusted command' },
    ],
  }),
}))
vi.mock('./layout.service', () => ({
  getTabs: () => ({
    workspace: { tabs: [{ id: 'tab', name: 'Tab' }], activeTabId: 'tab' },
  }),
  setTabs: vi.fn(),
}))
vi.mock('./agent.service', () => ({ startAgent: m.start, killAgent: m.kill }))
vi.mock('./account-usage.service', () => ({
  listUsageProfiles: () => [
    {
      id: 'account',
      name: 'Account',
      provider: 'codex',
      directoryPath: '/private/account',
    },
  ],
  getAccountUsage: m.usage,
}))
vi.mock('./worktree-setup.service', () => ({ getSetupState: () => undefined }))
vi.mock('./worktree.service', () => ({
  isWorktreeDirty: m.dirty,
  listBranches: async () => ['main'],
}))
import { handleMobileBridge } from './mobileRelayBridge'
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve))
}
async function mutate(fields: object) {
  const requestId = randomUUID()
  const answer = await handleMobileBridge('device', {
    ...fields,
    requestId,
    v: 1,
    seq: 1,
  })
  await settle()
  return {
    answer,
    operation: await handleMobileBridge('device', {
      type: 'operations.get',
      operationId: requestId,
    }),
    requestId,
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  m.start.mockResolvedValue({ session: { id: 'new-session' } })
  m.dirty.mockResolvedValue(false)
})
describe('mobile desktop bridge', () => {
  it('cancels queued mutations if the phone is revoked before execution', async () => {
    const requestId = randomUUID()
    await handleMobileBridge('device', {type: 'profiles.create', name: 'Revoked', requestId}, () => false)
    await settle()
    expect(m.addProfile).not.toHaveBeenCalled()
    expect(await handleMobileBridge('device', {type: 'operations.get', operationId: requestId})).toMatchObject({operation: {state: 'failed', code: 'device_revoked'}})
  })
  it('publishes safe paginated DTOs and strips terminal commands and account credentials', async () => {
    const catalog = await handleMobileBridge('device', { type: 'catalog.get' })
    expect(JSON.stringify(catalog)).not.toContain('private-command')
    expect(catalog).toMatchObject({ nextOffset: null })
    m.usage.mockResolvedValue([
      {
        profileId: 'account',
        status: 'ready',
        plan: 'Pro',
        windows: [],
        updatedAt: 1,
        authFingerprint: 'secret',
        resetCredits: { availableCount: 2, credits: [{ expiresAt: 999 }] },
      },
    ])
    const usage = await handleMobileBridge('device', { type: 'usage.get' })
    expect(JSON.stringify(usage)).not.toMatch(
      /secret|private|expiresAt|directoryPath|authFingerprint/,
    )
    expect(usage).toMatchObject({
      list: [{ name: 'Account', resetCredits: { availableCount: 2 } }],
    })
  })
  it('keeps desktop selection when creating a profile and registering a project', async () => {
    await mutate({ type: 'profiles.create', name: 'Mobile' })
    expect(m.addProfile).toHaveBeenCalledWith('Mobile', false)
    await mutate({
      type: 'projects.add',
      profileId: 'profile',
      path: '/new-project',
    })
    expect(m.addFolder).toHaveBeenCalledWith('/new-project', {
      profileId: 'profile',
      activate: false,
    })
    const invalid = await mutate({
      type: 'projects.add',
      profileId: 'profile',
      path: 'relative',
    })
    expect(invalid.operation).toMatchObject({
      operation: { state: 'failed', code: 'invalid_path' },
    })
  })
  it('only launches registered desktop presets and validates tab/workspace ownership', async () => {
    await mutate({
      type: 'terminals.create',
      workspaceId: 'workspace',
      presetId: 'shell',
      command: 'untrusted command',
    })
    expect(m.start).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'trusted command',
        tabId: 'tab',
        workspaceId: 'workspace',
      }),
    )
    const invalid = await mutate({
      type: 'terminals.create',
      workspaceId: 'workspace',
      presetId: 'arbitrary',
    })
    expect(invalid.operation).toMatchObject({
      operation: { state: 'failed', code: 'invalid_preset' },
    })
    const wrong = await mutate({
      type: 'terminals.create',
      workspaceId: 'workspace',
      presetId: 'shell',
      tabId: 'wrong',
    })
    expect(wrong.operation).toMatchObject({
      operation: { state: 'failed', code: 'invalid_tab' },
    })
  })
  it('deduplicates destructive requests and requires confirmation before stopping terminals', async () => {
    const denied = await mutate({
      type: 'terminals.kill',
      sessionId: 'session',
    })
    expect(denied.operation).toMatchObject({ operation: { state: 'failed' } })
    expect(m.kill).not.toHaveBeenCalled()
    const { requestId } = await mutate({
      type: 'terminals.kill',
      sessionId: 'session',
      confirmed: true,
    })
    await handleMobileBridge('device', {
      type: 'terminals.kill',
      sessionId: 'session',
      confirmed: true,
      requestId,
      v: 1,
      seq: 999,
    })
    await settle()
    expect(m.kill).toHaveBeenCalledTimes(1)
  })
  it('requires explicit force for dirty worktrees before any terminal is killed', async () => {
    const ws = m.state.workspaces[0] as (typeof m.state.workspaces)[0] & {
      worktreePath?: string
    }
    ws.worktreePath = '/project/worktree'
    m.dirty.mockResolvedValue(true)
    try {
      const result = await mutate({
        type: 'workspaces.remove',
        id: 'workspace',
        confirmed: true,
      })
      expect(result.operation).toMatchObject({
        operation: { state: 'failed', code: 'dirty_worktree' },
      })
      expect(m.kill).not.toHaveBeenCalled()
      expect(m.remove).not.toHaveBeenCalled()
    } finally {
      delete ws.worktreePath
    }
  })
  it('rejects unregistered projects and invalid pagination cursors', async () => {
    await expect(
      handleMobileBridge('device', { type: 'branches.list', path: '/etc' }),
    ).rejects.toThrow('invalid_project')
    await expect(
      handleMobileBridge('device', { type: 'catalog.get', offset: -1 }),
    ).rejects.toThrow('invalid_cursor')
    await expect(
      handleMobileBridge('device', { type: 'catalog.get', token: 'missing' }),
    ).rejects.toThrow('expired_cursor')
  })
})
