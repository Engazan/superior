import { IPC, type AgentTask, type TasksState } from '@shared/types'
import {
  clearFinishedTasks,
  deleteTask,
  listTasks,
  saveTask,
  setTasksPaused
} from '../services/tasks.service'
import { handle } from './handle'

export function registerTasksIpc(): void {
  handle(IPC.TASKS_LIST, (): TasksState => listTasks())

  handle(IPC.TASKS_SAVE, (task: AgentTask): TasksState => saveTask(task))

  handle(IPC.TASKS_DELETE, (id: string): TasksState => deleteTask(id))

  handle(IPC.TASKS_CLEAR_FINISHED, (folderPath: string): TasksState =>
    clearFinishedTasks(folderPath)
  )

  handle(IPC.TASKS_SET_PAUSED, (paused: boolean): TasksState =>
    setTasksPaused(paused)
  )
}
