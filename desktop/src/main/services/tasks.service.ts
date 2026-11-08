import { randomUUID } from 'crypto'
import { isAgentTask } from '../ipc/validation'
import type { AgentTask, TasksState } from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

function storeFile(): string {
  return userDataFile('tasks.json')
}

function save(state: TasksState): void {
  writeJsonFile(storeFile(), state, 'tasks')
}

function read(): TasksState {
  const parsed = readJsonFile<TasksState | null>(storeFile(), null, (p) => {
    const obj = p as Partial<TasksState>
    return obj && Array.isArray(obj.tasks)
      ? { tasks: obj.tasks.filter(isTask), paused: obj.paused === true }
      : null
  })
  return parsed ?? { tasks: [], paused: false }
}

const isTask = isAgentTask

/**
 * Persisted task queue. The queue *engine* (start next, watch exits) lives in
 * the renderer, which owns tabs and session state; this store is only the
 * durable record. Tasks stored as 'running' can be stale after a crash — the
 * renderer reconciles them against surviving daemon sessions on launch.
 */
export function listTasks(): TasksState {
  return read()
}

/** Upsert a task by id (adds when new, replaces when existing). */
export function saveTask(task: AgentTask): TasksState {
  const state = read()
  const idx = state.tasks.findIndex((t) => t.id === task.id)
  if (idx >= 0) state.tasks[idx] = task
  else state.tasks.push(task)
  save(state)
  return state
}

export function deleteTask(id: string): TasksState {
  const state = read()
  state.tasks = state.tasks.filter((t) => t.id !== id)
  save(state)
  return state
}

/** Drop every finished (done/failed/canceled) task of one folder. */
export function clearFinishedTasks(folderPath: string): TasksState {
  const state = read()
  state.tasks = state.tasks.filter(
    (t) => t.folderPath !== folderPath || t.status === 'queued' || t.status === 'running'
  )
  save(state)
  return state
}

/** Pause/resume the queue (running tasks finish; queued ones wait). */
export function setTasksPaused(paused: boolean): TasksState {
  const state = read()
  state.paused = paused
  save(state)
  return state
}

/** Complete a run and enqueue its successor in one durable write. */
export function finishTaskRun(id: string, result: Partial<AgentTask>): void {
  const state = read()
  const task = state.tasks.find(t => t.id === id)
  if (!task || task.status !== 'running') return
  Object.assign(task, result, { finishedAt: Date.now() })
  if (task.repeatMinutes && result.status !== 'canceled') {
    const interval = task.repeatMinutes * 60_000
    const base = task.scheduledAt ?? task.startedAt ?? Date.now()
    const scheduledAt = base + Math.max(1, Math.floor((Date.now() - base) / interval) + 1) * interval
    state.tasks.push({ id: randomUUID(), automationId: task.automationId ?? task.id,
      folderPath: task.folderPath, prompt: task.prompt, presetId: task.presetId, useWorktree: task.useWorktree,
      repeatMinutes: task.repeatMinutes, precheck: task.precheck, timeoutMinutes: task.timeoutMinutes,
      scheduledAt, status: 'queued', createdAt: Date.now() })
  }
  save(state)
}
