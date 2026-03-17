import { ipcMain } from 'electron'
import { IPC, type WorkspaceState } from '@shared/types'
import {
  addWorkspace,
  listWorkspaces,
  removeWorkspace,
  setActiveWorkspace
} from '../services/workspace.service'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IPC.WORKSPACE_LIST, (): WorkspaceState => listWorkspaces())

  ipcMain.handle(
    IPC.WORKSPACE_ADD,
    async (): Promise<WorkspaceState | null | { error: string }> => {
      try {
        return await addWorkspace()
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(IPC.WORKSPACE_REMOVE, (_event, path: string): WorkspaceState =>
    removeWorkspace(path)
  )

  ipcMain.handle(IPC.WORKSPACE_SET_ACTIVE, (_event, path: string): WorkspaceState =>
    setActiveWorkspace(path)
  )
}
