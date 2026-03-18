import { ipcMain } from 'electron'
import { IPC, type BranchInfo, type WorktreeAddArgs, type WorktreeAddResult } from '@shared/types'
import { addWorktreeWorkspace } from '../services/workspace.service'
import { isWorktreeDirty, listBranches } from '../services/worktree.service'
import { gitErrorMessage } from '../services/git.service'

export function registerWorktreeIpc(): void {
  ipcMain.handle(IPC.WORKTREE_LIST_BRANCHES, (_e, folderPath: string): Promise<BranchInfo[]> =>
    listBranches(folderPath)
  )

  ipcMain.handle(
    IPC.WORKSPACE_ADD_WORKTREE,
    async (_e, args: WorktreeAddArgs): Promise<WorktreeAddResult> => {
      try {
        return await addWorktreeWorkspace(args)
      } catch (err) {
        // Stable WORKTREE_ERROR codes and raw git stderr both surface here;
        // the renderer localizes known codes and shows the rest verbatim.
        return { error: gitErrorMessage(err) }
      }
    }
  )

  ipcMain.handle(IPC.WORKTREE_IS_DIRTY, (_e, worktreePath: string): Promise<boolean> =>
    isWorktreeDirty(worktreePath)
  )
}
