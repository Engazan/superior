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

const TASK_STATUSES = new Set(['queued', 'running', 'done', 'failed', 'canceled'])

function isTask(value: unknown): value is AgentTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Record<string, unknown>
  return (
    typeof task.id === 'string' &&
    typeof task.folderPath === 'string' &&
    typeof task.prompt === 'string' &&
    typeof task.presetId === 'string' &&
    typeof task.useWorktree === 'boolean' &&
    typeof task.status === 'string' &&
    TASK_STATUSES.has(task.status) &&
    typeof task.createdAt === 'number' &&
    Number.isFinite(task.createdAt)
  )
}

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
