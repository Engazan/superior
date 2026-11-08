import { cancelTaskRun } from '../services/task-engine.service'
import { IPC, type AgentTask, type TasksState } from '@shared/types'
import {
  clearFinishedTasks,
  deleteTask,
  listTasks,
  saveTask,
  setTasksPaused
} from '../services/tasks.service'
import { handle } from './handle'
import { boundedString, invalidPayload, isAgentTask, validId } from './validation'

export function registerTasksIpc(): void {
  handle(IPC.TASKS_LIST, (): TasksState => listTasks())

  handle(IPC.TASKS_SAVE, async (task: AgentTask): Promise<TasksState> => {
    if (!isAgentTask(task)) return invalidPayload()
    const existing = listTasks().tasks.find(t => t.id === task.id)
    if (existing && task.status === 'canceled') { await cancelTaskRun(task.id); return listTasks() }
    if (task.status !== 'queued' || (existing && existing.status !== 'queued')) throw new Error('Task is no longer queued.')
    return saveTask(task)
  })

  handle(IPC.TASKS_DELETE, (id: string): TasksState =>
    validId(id) && listTasks().tasks.find(t => t.id === id)?.status !== 'running' ? deleteTask(id) : invalidPayload()
  )

  handle(IPC.TASKS_CLEAR_FINISHED, (folderPath: string): TasksState =>
    boundedString(folderPath) ? clearFinishedTasks(folderPath) : invalidPayload()
  )

  handle(IPC.TASKS_SET_PAUSED, (paused: boolean): TasksState =>
    typeof paused === 'boolean' ? setTasksPaused(paused) : invalidPayload()
  )
}
