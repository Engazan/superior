import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ ensure: vi.fn(), spawn: vi.fn(), valid: vi.fn(() => true) }))
vi.mock('./worktree-setup.service', () => ({ ensureSetupReady: mocks.ensure }))
vi.mock('./workspace.service', () => ({
  isValidWorkspaceDir: mocks.valid,
  isWithinWorkspaceFolder: () => true,
  listWorkspaces: () => ({ workspaces: [{ id: 'ws', folderPath: '/repo', worktreePath: '/checkout' }] })
}))
vi.mock('./daemonClient', () => ({ daemonClient: { spawn: mocks.spawn, onExit: () => () => {} } }))
vi.mock('./usage.service', () => ({ startUsageTracking: vi.fn(), stopAllUsageTracking: vi.fn() }))
vi.mock('./statusline.service', () => ({ ensureClaudeStatusline: vi.fn(), restoreAllClaudeStatuslines: vi.fn() }))
vi.mock('./settings.service', () => ({ getSettings: () => ({ usageTracking: false }) }))
vi.mock('./session-store.service', () => ({ upsertPersistedSession: vi.fn() }))
import { startAgent } from './agent.service'

const args = { command: 'agent', label: 'Agent', workspaceId: 'ws', tabId: 'tab', cwd: '/checkout' }
beforeEach(() => { vi.clearAllMocks(); mocks.valid.mockReturnValue(true); mocks.spawn.mockResolvedValue({ pid: 123 }); mocks.ensure.mockResolvedValue(undefined) })
describe('agent preparation gate', () => {
  it('does not spawn until setup succeeds', async () => {
    let finish!: () => void
    mocks.ensure.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    const launch = startAgent(args)
    expect(mocks.spawn).not.toHaveBeenCalled()
    finish()
    expect(await launch).toHaveProperty('session')
    expect(mocks.spawn).toHaveBeenCalledOnce()
  })
  it('blocks a failed setup while allowing a plain repair shell', async () => {
    mocks.ensure.mockRejectedValue(new Error('Setup failed'))
    expect(await startAgent(args)).toEqual({ error: 'Setup failed' })
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(await startAgent({ ...args, command: '' })).toHaveProperty('session')
    expect(mocks.spawn).toHaveBeenCalledOnce()
  })
  it('also gates a worktree subdirectory with a different workspace id', async () => {
    mocks.ensure.mockRejectedValue(new Error('Setup failed'))
    expect(await startAgent({ ...args, workspaceId: 'other', cwd: '/checkout/src' })).toEqual({ error: 'Setup failed' })
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
  it('revalidates the directory if removed while waiting', async () => {
    mocks.ensure.mockImplementation(async () => { mocks.valid.mockReturnValue(false) })
    expect(await startAgent(args)).toHaveProperty('error')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
})
