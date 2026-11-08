import { useCallback, useEffect, useState } from 'react'
import type { AgentTask, TasksState } from '../types'
export { buildTaskCommand } from '@shared/task-command'
export type NewTask = Pick<AgentTask, 'folderPath' | 'prompt' | 'presetId' | 'useWorktree' | 'scheduledAt' | 'repeatMinutes' | 'precheck' | 'timeoutMinutes'>
export interface TaskQueueApi {
  tasks: AgentTask[]; paused: boolean
  addTask: (args: NewTask) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  retryTask: (id: string) => Promise<void>
  moveTask: (id: string, direction: -1 | 1) => Promise<void>
  clearFinished: (folderPath: string) => Promise<void>
  setPaused: (paused: boolean) => Promise<void>
}
/** Main owns execution; renderer only displays and submits durable task records. */
export function useTaskQueue(_deps: unknown): TaskQueueApi {
  const [state, setState] = useState<TasksState>({ tasks: [], paused: false })
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const refresh = async (): Promise<void> => {
      try { const next = await window.api.listTasks(); if (active) setState(next) }
      catch { /* Keep the last known state while main reconnects. */ }
      if (active) timer = setTimeout(() => void refresh(), 1000)
    }
    void refresh()
    return () => { active = false; clearTimeout(timer) }
  }, [])
  const save = useCallback(async (task: AgentTask) => { setState(await window.api.saveTask(task)) }, [])
  return {
    ...state,
    addTask: async args => save({ ...args, id: crypto.randomUUID(), prompt: args.prompt.trim(), status: 'queued', createdAt: Date.now() }),
    deleteTask: async id => { setState(await window.api.deleteTask(id)) },
    cancelTask: async id => { const task = state.tasks.find(t => t.id === id); if (task) await save({ ...task, status: 'canceled' }) },
    retryTask: async id => {
      const task = state.tasks.find(t => t.id === id)
      if (!task || task.status === 'running' || task.status === 'queued') return
      await save({ id: crypto.randomUUID(), folderPath: task.folderPath, prompt: task.prompt,
        presetId: task.presetId, useWorktree: task.useWorktree, timeoutMinutes: task.timeoutMinutes,
        ...(task.error?.startsWith('setup-failed:') ? { workspaceId: task.workspaceId, branch: task.branch } : {}),
        status: 'queued', createdAt: Date.now() })
    },
    moveTask: async (id, direction) => {
      const task = state.tasks.find(t => t.id === id)
      if (!task || task.status !== 'queued') return
      const queue = state.tasks.filter(t => t.folderPath === task.folderPath && t.status === 'queued').sort((a, b) => a.createdAt - b.createdAt)
      const other = queue[queue.findIndex(t => t.id === id) + direction]
      if (other) await save({ ...task, createdAt: other.createdAt + direction })
    },
    clearFinished: async folder => { setState(await window.api.clearFinishedTasks(folder)) },
    setPaused: async paused => { setState(await window.api.setTasksPaused(paused)) }
  }
}
