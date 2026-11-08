import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const electron = vi.hoisted(() => ({ getPath: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: electron.getPath } }))
import { saveTask, listTasks, finishTaskRun } from './tasks.service'
import { isAgentTask } from '../ipc/validation'

describe('durable scheduled runs', () => {
  let directory: string
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-tasks-')); electron.getPath.mockReturnValue(directory); vi.spyOn(Date, 'now').mockReturnValue(1_000_000) })
  afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks() })
  const task = { id: 'run', folderPath: '/repo', presetId: 'claude', prompt: 'review', useWorktree: true, status: 'running' as const, createdAt: 1, startedAt: 1, scheduledAt: 1, repeatMinutes: 1 }
  it('records the result and exactly one next run, skipping missed intervals', () => {
    saveTask(task)
    finishTaskRun('run', { status: 'done', outcome: 'skipped_precheck' })
    finishTaskRun('run', { status: 'done' })
    const state = listTasks()
    expect(state.tasks).toHaveLength(2)
    expect(state.tasks[0]).toMatchObject({ status: 'done', outcome: 'skipped_precheck' })
    expect(state.tasks[1]).toMatchObject({ status: 'queued', scheduledAt: 1_020_001, automationId: 'run' })
    expect(state.tasks[1].sessionId).toBeUndefined()
    expect(state.tasks[1].workspaceId).toBeUndefined()
  })
  it('does not repeat canceled tasks or accept a stale completion', () => {
    saveTask(task)
    finishTaskRun('run', { status: 'canceled' })
    finishTaskRun('run', { status: 'done' })
    expect(listTasks().tasks).toHaveLength(1)
    expect(listTasks().tasks[0].status).toBe('canceled')
  })
  it('rejects invalid scheduling payloads', () => {
    for (const change of [{ repeatMinutes: 0 }, { repeatMinutes: Infinity }, { scheduledAt: NaN }, { timeoutMinutes: -1 }, { precheck: '\0' }]) {
      expect(isAgentTask({ ...task, ...change })).toBe(false)
    }
  })
})
