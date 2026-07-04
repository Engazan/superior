import { ipcMain } from 'electron'
import { IPC, type AgentTask, type TasksState } from '@shared/types'
import {
  clearFinishedTasks,
  deleteTask,
  listTasks,
  saveTask,
  setTasksPaused
} from '../services/tasks.service'

export function registerTasksIpc(): void {
  ipcMain.handle(IPC.TASKS_LIST, (): TasksState => listTasks())

  ipcMain.handle(IPC.TASKS_SAVE, (_e, task: AgentTask): TasksState => saveTask(task))

  ipcMain.handle(IPC.TASKS_DELETE, (_e, id: string): TasksState => deleteTask(id))

  ipcMain.handle(IPC.TASKS_CLEAR_FINISHED, (_e, folderPath: string): TasksState =>
    clearFinishedTasks(folderPath)
  )

  ipcMain.handle(IPC.TASKS_SET_PAUSED, (_e, paused: boolean): TasksState =>
    setTasksPaused(paused)
  )
}
