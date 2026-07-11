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
import {
  boundedString,
  boundedStringArray,
  invalidPayload,
  isFolderUpdate,
  isNullableId,
  isProfileUpdate,
  isRecord,
  isRemoteTarget,
  validId
} from './validation'

export function registerWorkspaceIpc(startupReady: Promise<unknown>): void {
  // The initial state read waits for the startup worktree reconcile, so a
  // vanished worktree never leaves an agent launching in a stale cwd — while
  // the window itself gets created and loads in parallel.
  handle(IPC.WORKSPACE_LIST, async (): Promise<WorkspaceState> => {
    await startupReady
    return listWorkspaces()
  })

  handle(IPC.PROFILE_ADD, (name: string): WorkspaceState =>
    boundedString(name, 1_000) ? addProfile(name) : invalidPayload()
  )

  handle(
    IPC.PROFILE_RENAME,
    (args: { id: string; name: string }): WorkspaceState =>
      isRecord(args) && validId(args.id) && boundedString(args.name, 1_000)
        ? renameProfile(args.id, args.name)
        : invalidPayload()
  )

  handle(
    IPC.PROFILE_UPDATE,
    (args: { id: string; patch: ProfileUpdate }): WorkspaceState =>
      isRecord(args) && validId(args.id) && isProfileUpdate(args.patch)
        ? updateProfile(args.id, args.patch)
        : invalidPayload()
  )

  handle(IPC.PROFILE_REMOVE, (id: string): Promise<WorkspaceState> =>
    validId(id) ? removeProfile(id) : Promise.reject(new Error('invalid-ipc-payload'))
  )

  handle(IPC.PROFILE_SET_ACTIVE, (id: string): WorkspaceState =>
    validId(id) ? setActiveProfile(id) : invalidPayload()
  )

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
        return isRemoteTarget(args) ? addRemoteFolder(args) : { error: 'invalid-ipc-payload' }
      } catch (err) {
        return { error: (err as Error).message }
      }
    }
  )

  handle(
    IPC.REMOTE_WORKSPACE_TEST,
    (args: RemoteWorkspaceTarget): Promise<RemoteFolderTestResult> =>
      isRemoteTarget(args)
        ? testRemoteFolder(args)
        : Promise.resolve({ ok: false, error: 'invalid-ipc-payload' })
  )

  handle(IPC.FOLDER_REMOVE, (folderPath: string): Promise<WorkspaceState> =>
    boundedString(folderPath) ? removeFolder(folderPath) : Promise.reject(new Error('invalid-ipc-payload'))
  )

  handle(IPC.FOLDER_REORDER, (orderedPaths: string[]): WorkspaceState =>
    boundedStringArray(orderedPaths) ? reorderFolders(orderedPaths) : invalidPayload()
  )

  handle(
    IPC.FOLDER_UPDATE,
    (args: { folderPath: string; patch: FolderUpdate }): WorkspaceState =>
      isRecord(args) && boundedString(args.folderPath) && isFolderUpdate(args.patch)
        ? updateFolder(args.folderPath, args.patch)
        : invalidPayload()
  )

  handle(
    IPC.WORKSPACE_ADD,
    (args: { folderPath: string; name: string }): WorkspaceState =>
      isRecord(args) && boundedString(args.folderPath) && boundedString(args.name, 1_000)
        ? addWorkspace(args.folderPath, args.name)
        : invalidPayload()
  )

  handle(
    IPC.WORKSPACE_RENAME,
    (args: { id: string; name: string }): WorkspaceState =>
      isRecord(args) && validId(args.id) && boundedString(args.name, 1_000)
        ? renameWorkspace(args.id, args.name)
        : invalidPayload()
  )

  handle(
    IPC.WORKSPACE_SET_STARTUP_LAYOUT,
    (args: { id: string; layoutId: string | null }): WorkspaceState =>
      isRecord(args) && validId(args.id) && isNullableId(args.layoutId)
        ? setWorkspaceStartupLayout(args.id, args.layoutId)
        : invalidPayload()
  )

  handle(
    IPC.WORKSPACE_REMOVE,
    (args: { id: string; force?: boolean }): Promise<WorkspaceState> =>
      isRecord(args) && validId(args.id) &&
      (args.force === undefined || typeof args.force === 'boolean')
        ? removeWorkspace(args.id, args.force ?? false)
        : Promise.reject(new Error('invalid-ipc-payload'))
  )

  handle(IPC.WORKSPACE_SET_ACTIVE, (id: string): WorkspaceState =>
    validId(id) ? setActiveWorkspace(id) : invalidPayload()
  )
}
