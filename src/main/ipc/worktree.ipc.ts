import { IPC, type BranchInfo, type WorktreeAddArgs, type WorktreeAddResult } from '@shared/types'
import { addWorktreeWorkspace, isWithinWorkspaceFolder } from '../services/workspace.service'
import { isWorktreeDirty, listBranches } from '../services/worktree.service'
import { gitErrorMessage } from '../services/git.service'
import { handle } from './handle'

export function registerWorktreeIpc(): void {
  // Read-only git against renderer-supplied dirs — keep the same containment
  // rule the git/fs handlers enforce (WORKSPACE_ADD_WORKTREE validates its
  // folder against the store itself).
  handle(IPC.WORKTREE_LIST_BRANCHES, (folderPath: string): Promise<BranchInfo[]> =>
    isWithinWorkspaceFolder(folderPath) ? listBranches(folderPath) : Promise.resolve([])
  )

  handle(
    IPC.WORKSPACE_ADD_WORKTREE,
    async (args: WorktreeAddArgs): Promise<WorktreeAddResult> => {
      try {
        return await addWorktreeWorkspace(args)
      } catch (err) {
        // Stable WORKTREE_ERROR codes and raw git stderr both surface here;
        // the renderer localizes known codes and shows the rest verbatim.
        return { error: gitErrorMessage(err) }
      }
    }
  )

  handle(IPC.WORKTREE_IS_DIRTY, (worktreePath: string): Promise<boolean> =>
    isWithinWorkspaceFolder(worktreePath) ? isWorktreeDirty(worktreePath) : Promise.resolve(false)
  )
}
