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
import { handle } from './handle'

export function registerWorkspaceIpc(startupReady: Promise<unknown>): void {
  // The initial state read waits for the startup worktree reconcile, so a
  // vanished worktree never leaves an agent launching in a stale cwd — while
  // the window itself gets created and loads in parallel.
  handle(IPC.WORKSPACE_LIST, async (): Promise<WorkspaceState> => {
    await startupReady
    return listWorkspaces()
  })

  handle(IPC.PROFILE_ADD, (name: string): WorkspaceState => addProfile(name))

  handle(
    IPC.PROFILE_RENAME,
    (args: { id: string; name: string }): WorkspaceState => renameProfile(args.id, args.name)
  )

  handle(
    IPC.PROFILE_UPDATE,
    (args: { id: string; patch: ProfileUpdate }): WorkspaceState =>
      updateProfile(args.id, args.patch)
  )

  handle(IPC.PROFILE_REMOVE, (id: string): Promise<WorkspaceState> => removeProfile(id))

  handle(IPC.PROFILE_SET_ACTIVE, (id: string): WorkspaceState => setActiveProfile(id))

  handle(
    IPC.FOLDER_ADD,
    async (): Promise<WorkspaceState | null | { error: string }> => {
      try {
        return await addFolder()
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  handle(
    IPC.FOLDER_ADD_REMOTE,
    (args: RemoteFolderAddArgs): WorkspaceState | { error: string } => {
      try {
        return addRemoteFolder(args)
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  handle(
    IPC.REMOTE_WORKSPACE_TEST,
    (args: RemoteWorkspaceTarget): Promise<RemoteFolderTestResult> => testRemoteFolder(args)
  )

  handle(IPC.FOLDER_REMOVE, (folderPath: string): Promise<WorkspaceState> =>
    removeFolder(folderPath)
  )

  handle(IPC.FOLDER_REORDER, (orderedPaths: string[]): WorkspaceState =>
    reorderFolders(orderedPaths)
  )

  handle(
    IPC.FOLDER_UPDATE,
    (args: { folderPath: string; patch: FolderUpdate }): WorkspaceState =>
      updateFolder(args.folderPath, args.patch)
  )

  handle(
    IPC.WORKSPACE_ADD,
    (args: { folderPath: string; name: string }): WorkspaceState =>
      addWorkspace(args.folderPath, args.name)
  )

  handle(
    IPC.WORKSPACE_RENAME,
    (args: { id: string; name: string }): WorkspaceState =>
      renameWorkspace(args.id, args.name)
  )

  handle(
    IPC.WORKSPACE_SET_STARTUP_LAYOUT,
    (args: { id: string; layoutId: string | null }): WorkspaceState =>
      setWorkspaceStartupLayout(args.id, args.layoutId)
  )

  handle(
    IPC.WORKSPACE_REMOVE,
    (args: { id: string; force?: boolean }): Promise<WorkspaceState> =>
      removeWorkspace(args.id, args.force ?? false)
  )

  handle(IPC.WORKSPACE_SET_ACTIVE, (id: string): WorkspaceState =>
    setActiveWorkspace(id)
  )
}
