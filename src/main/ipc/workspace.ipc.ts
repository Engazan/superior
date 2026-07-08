import { ipcMain } from 'electron'
import {
  IPC,
  type FolderUpdate,
  type ProfileUpdate,
  type RemoteFolderAddArgs,
  type RemoteFolderTestResult,
  type RemoteWorkspaceTarget,
  type WorkspaceState
} from '@shared/types'
import {
  addFolder,
  addRemoteFolder,
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
  setWorkspaceStartupLayout,
  testRemoteFolder,
  updateFolder,
  updateProfile
} from '../services/workspace.service'

export function registerWorkspaceIpc(startupReady: Promise<unknown>): void {
  // The initial state read waits for the startup worktree reconcile, so a
  // vanished worktree never leaves an agent launching in a stale cwd — while
  // the window itself gets created and loads in parallel.
  ipcMain.handle(IPC.WORKSPACE_LIST, async (): Promise<WorkspaceState> => {
    await startupReady
    return listWorkspaces()
  })

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

  ipcMain.handle(
    IPC.FOLDER_ADD_REMOTE,
    (_e, args: RemoteFolderAddArgs): WorkspaceState | { error: string } => {
      try {
        return addRemoteFolder(args)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    IPC.REMOTE_WORKSPACE_TEST,
    (_e, args: RemoteWorkspaceTarget): Promise<RemoteFolderTestResult> => testRemoteFolder(args)
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
    IPC.WORKSPACE_SET_STARTUP_LAYOUT,
    (_e, args: { id: string; layoutId: string | null }): WorkspaceState =>
      setWorkspaceStartupLayout(args.id, args.layoutId)
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
