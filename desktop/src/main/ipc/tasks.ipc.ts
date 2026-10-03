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

  handle(IPC.TASKS_SAVE, (task: AgentTask): TasksState =>
    isAgentTask(task) ? saveTask(task) : invalidPayload()
  )

  handle(IPC.TASKS_DELETE, (id: string): TasksState =>
    validId(id) ? deleteTask(id) : invalidPayload()
  )

  handle(IPC.TASKS_CLEAR_FINISHED, (folderPath: string): TasksState =>
    boundedString(folderPath) ? clearFinishedTasks(folderPath) : invalidPayload()
  )

  handle(IPC.TASKS_SET_PAUSED, (paused: boolean): TasksState =>
    typeof paused === 'boolean' ? setTasksPaused(paused) : invalidPayload()
  )
}
