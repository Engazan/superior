import { ipcMain } from 'electron'
import { IPC, type BranchSwitchResult, type GitDiff, type GitStatus } from '@shared/types'
import {
  createBranch,
  getGitDiff,
  getGitStatus,
  initGit,
  switchBranch
} from '../services/git.service'

export function registerGitIpc(): void {
  ipcMain.handle(IPC.GIT_STATUS, (_event, folderPath: string): Promise<GitStatus> =>
    getGitStatus(folderPath)
  )

  ipcMain.handle(IPC.GIT_INIT, (_event, folderPath: string): Promise<GitStatus> =>
    initGit(folderPath)
  )

  ipcMain.handle(IPC.GIT_DIFF, (_event, folderPath: string): Promise<GitDiff> =>
    getGitDiff(folderPath)
  )

  ipcMain.handle(
    IPC.GIT_SWITCH_BRANCH,
    (
      _event,
      args: { folderPath: string; branch: string; opts?: { stash?: boolean } }
    ): Promise<BranchSwitchResult> => switchBranch(args.folderPath, args.branch, args.opts ?? {})
  )

  ipcMain.handle(
    IPC.GIT_CREATE_BRANCH,
    (_event, args: { folderPath: string; branch: string }): Promise<BranchSwitchResult> =>
      createBranch(args.folderPath, args.branch)
  )
}
