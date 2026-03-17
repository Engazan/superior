import { ipcMain } from 'electron'
import { IPC, type Workspace } from '@shared/types'
import { getLastWorkspace, openWorkspaceDialog } from '../services/workspace.service'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(
    IPC.WORKSPACE_OPEN,
    async (): Promise<{ workspace: Workspace | null } | { error: string }> => {
      try {
        const workspace = await openWorkspaceDialog()
        return { workspace }
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(IPC.WORKSPACE_GET_LAST, (): Workspace | null => {
    return getLastWorkspace()
  })
}
