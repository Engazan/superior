import { ensureSetupReady, cancelSetup, getSetupConfig, getSetupState, runSetup, saveSetupConfig } from '../services/worktree-setup.service'
import { listWorkspaces } from '../services/workspace.service'
import { IPC, type BranchInfo, type WorktreeAddArgs, type WorktreeAddResult } from '@shared/types'
import { addWorktreeWorkspace, isWithinWorkspaceFolder } from '../services/workspace.service'
import { isWorktreeDirty, listBranches } from '../services/worktree.service'
import { gitErrorMessage } from '../services/git-runner'
import { handle } from './handle'
import { boundedString, isWorktreeAddArgs } from './validation'

function setupWorkspace(id: string) {
  if (!boundedString(id)) throw new Error('Invalid workspace.')
  const state = listWorkspaces()
  const ws = state.workspaces.find(w => w.id === id)
  if (!ws || state.folders.find(f => f.path === ws.folderPath)?.kind === 'remote') throw new Error('Select a local workspace.')
  return ws
}

export function registerWorktreeIpc(): void {
  handle(IPC.WORKTREE_SETUP_WAIT, id => ensureSetupReady(setupWorkspace(id)))
  handle(IPC.WORKTREE_SETUP_GET, id => {
    const ws = setupWorkspace(id)
    return { config: getSetupConfig(ws.folderPath), state: getSetupState(ws) }
  })
  handle(IPC.WORKTREE_SETUP_SAVE, (id, config) => {
    saveSetupConfig(setupWorkspace(id).folderPath, config)
  })
  handle(IPC.WORKTREE_SETUP_RETRY, id => {
    const ws = setupWorkspace(id)
    if (!ws.worktreePath) throw new Error('Select a worktree workspace.')
    void runSetup(ws).catch(err => console.error('[worktree setup]', err))
  })
  handle(IPC.WORKTREE_SETUP_CANCEL, id => cancelSetup(setupWorkspace(id).id))
  // Read-only git against renderer-supplied dirs — keep the same containment
  // rule the git/fs handlers enforce (WORKSPACE_ADD_WORKTREE validates its
  // folder against the store itself).
  handle(IPC.WORKTREE_LIST_BRANCHES, (folderPath: string): Promise<BranchInfo[]> =>
    boundedString(folderPath) && isWithinWorkspaceFolder(folderPath)
      ? listBranches(folderPath)
      : Promise.resolve([])
  )

  handle(
    IPC.WORKSPACE_ADD_WORKTREE,
    async (args: WorktreeAddArgs): Promise<WorktreeAddResult> => {
      try {
        if (!isWorktreeAddArgs(args)) return { error: 'worktree:invalid-folder' }
        return await addWorktreeWorkspace(args)
      } catch (err) {
        // Stable WORKTREE_ERROR codes and raw git stderr both surface here;
        // the renderer localizes known codes and shows the rest verbatim.
        return { error: gitErrorMessage(err) }
      }
    }
  )

  handle(IPC.WORKTREE_IS_DIRTY, (worktreePath: string): Promise<boolean> =>
    boundedString(worktreePath) && isWithinWorkspaceFolder(worktreePath)
      ? isWorktreeDirty(worktreePath)
      : Promise.resolve(false)
  )
}
