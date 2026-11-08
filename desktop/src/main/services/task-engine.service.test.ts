import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentTask } from '@shared/types'
const mocks = vi.hoisted(() => ({ tasks: [] as AgentTask[], spawn: vi.fn(), list: vi.fn(), kill: vi.fn(), paused: false }))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./tasks.service', () => ({
  listTasks: () => ({ tasks: mocks.tasks, paused: mocks.paused }),
  saveTask: (task: AgentTask) => { mocks.tasks = mocks.tasks.map(t => t.id === task.id ? task : t) },
  finishTaskRun: (id: string, result: Partial<AgentTask>) => { mocks.tasks = mocks.tasks.map(t => t.id === id && t.status === 'running' ? { ...t, ...result } : t) }
}))
vi.mock('./daemonClient', () => ({ daemonClient: { list: mocks.list } }))
vi.mock('./agent.service', () => ({ startAgent: mocks.spawn, killAgent: mocks.kill }))
vi.mock('./presets.service', () => ({ listPresets: () => ({ presets: [{ id: 'p', command: 'claude', name: 'Claude' }] }) }))
vi.mock('./workspace.service', () => ({ listWorkspaces: () => ({ folders: [{ path: '/repo' }], workspaces: [{ id: 'w', folderPath: '/repo' }] }), addWorktreeWorkspace: vi.fn() }))
vi.mock('./worktree-setup.service', () => ({ ensureSetupReady: async () => {}, getSetupState: () => null, runSetup: async () => {}, cancelSetup: async () => {} }))
vi.mock('./layout.service', () => ({ getTabs: () => ({ w: { activeTabId: 'tab' } }), setTabs: vi.fn() }))
import { startTaskEngine, stopTaskEngine, cancelTaskRun } from './task-engine.service'
const task = (id: string): AgentTask => ({ id, folderPath: '/repo', prompt: 'review', presetId: 'p', useWorktree: false, status: 'queued', createdAt: 1 })
describe('main-process task engine', () => {
  beforeEach(() => {
    vi.useFakeTimers(); mocks.tasks = []; mocks.paused = false
    mocks.list.mockResolvedValue([]); mocks.kill.mockResolvedValue(undefined)
    mocks.spawn.mockResolvedValue({ session: { id: 'session', status: 'running' } })
  })
  afterEach(() => { stopTaskEngine(); vi.useRealTimers(); vi.clearAllMocks() })
  it('launches without a renderer and serializes tasks per folder', async () => {
    mocks.tasks = [task('one'), task('two')]
    startTaskEngine(); await vi.advanceTimersByTimeAsync(0)
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
    expect(mocks.spawn.mock.calls[0][0].command).toContain('claude --print')
    expect(mocks.tasks.map(t => t.status)).toEqual(['running', 'queued'])
    mocks.list.mockResolvedValue([{ id: 'session', status: 'exited', exitCode: 0 }])
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.tasks[0].status).toBe('done')
    expect(mocks.spawn).toHaveBeenCalledTimes(2)
  })
  it('does not start future or paused jobs', async () => {
    mocks.tasks = [{ ...task('one'), scheduledAt: Date.now() + 60_000 }]
    startTaskEngine(); await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.spawn).not.toHaveBeenCalled()
    mocks.paused = true
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
  it('kills a process that finishes spawning after cancellation', async () => {
    let resolve!: (value: unknown) => void
    mocks.spawn.mockImplementation(() => new Promise(r => { resolve = r }))
    mocks.tasks = [task('one')]
    startTaskEngine(); await vi.advanceTimersByTimeAsync(0)
    await cancelTaskRun('one')
    resolve({ session: { id: 'late', status: 'running' } })
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.kill).toHaveBeenCalledWith('late')
    expect(mocks.tasks[0].status).toBe('canceled')
  })
})
