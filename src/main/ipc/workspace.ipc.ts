import { ipcMain } from 'electron'
import { IPC, type FolderUpdate, type ProfileUpdate, type WorkspaceState } from '@shared/types'
import {
  addFolder,
  addProfile,
  addWorkspace,
  listWorkspaces,
  removeFolder,
  removeProfile,
  removeWorkspace,
  renameProfile,
  renameWorkspace,
  reorderFolders,
  setActiveProfile,
  setActiveWorkspace,
  updateFolder,
  updateProfile
} from '../services/workspace.service'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IPC.WORKSPACE_LIST, (): WorkspaceState => listWorkspaces())

  ipcMain.handle(IPC.PROFILE_ADD, (_e, name: string): WorkspaceState => addProfile(name))

  ipcMain.handle(
    IPC.PROFILE_RENAME,
    (_e, args: { id: string; name: string }): WorkspaceState => renameProfile(args.id, args.name)
  )

  ipcMain.handle(
    IPC.PROFILE_UPDATE,
    (_e, args: { id: string; patch: ProfileUpdate }): WorkspaceState =>
      updateProfile(args.id, args.patch)
  )

  ipcMain.handle(IPC.PROFILE_REMOVE, (_e, id: string): Promise<WorkspaceState> => removeProfile(id))

  ipcMain.handle(IPC.PROFILE_SET_ACTIVE, (_e, id: string): WorkspaceState => setActiveProfile(id))

  ipcMain.handle(
    IPC.FOLDER_ADD,
    async (): Promise<WorkspaceState | null | { error: string }> => {
      try {
        return await addFolder()
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(IPC.FOLDER_REMOVE, (_e, folderPath: string): Promise<WorkspaceState> =>
    removeFolder(folderPath)
  )

  ipcMain.handle(IPC.FOLDER_REORDER, (_e, orderedPaths: string[]): WorkspaceState =>
    reorderFolders(orderedPaths)
  )

  ipcMain.handle(
    IPC.FOLDER_UPDATE,
    (_e, args: { folderPath: string; patch: FolderUpdate }): WorkspaceState =>
      updateFolder(args.folderPath, args.patch)
  )

  ipcMain.handle(
    IPC.WORKSPACE_ADD,
    (_e, args: { folderPath: string; name: string }): WorkspaceState =>
      addWorkspace(args.folderPath, args.name)
  )

  ipcMain.handle(
    IPC.WORKSPACE_RENAME,
    (_e, args: { id: string; name: string }): WorkspaceState =>
      renameWorkspace(args.id, args.name)
  )

  ipcMain.handle(
    IPC.WORKSPACE_REMOVE,
    (_e, args: { id: string; force?: boolean }): Promise<WorkspaceState> =>
      removeWorkspace(args.id, args.force ?? false)
  )

  ipcMain.handle(IPC.WORKSPACE_SET_ACTIVE, (_e, id: string): WorkspaceState =>
    setActiveWorkspace(id)
  )
}
