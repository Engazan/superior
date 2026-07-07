import { ipcMain } from 'electron'
import {
  IPC,
  type BranchSwitchResult,
  type GitActionResult,
  type GitDiff,
  type GitDiffFile,
  type GitLogEntry,
  type GitStatus
} from '@shared/types'
import {
  commit,
  createBranch,
  getCommitDiff,
  getGitDiff,
  getGitLog,
  getGitStatus,
  initGit,
  pullBranch,
  pushBranch,
  stageAll,
  stageFile,
  switchBranch,
  unstageAll,
  unstageFile
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

  ipcMain.handle(
    IPC.GIT_STAGE,
    (_event, args: { folderPath: string; path: string }): Promise<GitActionResult> =>
      stageFile(args.folderPath, args.path)
  )

  ipcMain.handle(
    IPC.GIT_UNSTAGE,
    (_event, args: { folderPath: string; path: string }): Promise<GitActionResult> =>
      unstageFile(args.folderPath, args.path)
  )

  ipcMain.handle(IPC.GIT_STAGE_ALL, (_event, folderPath: string): Promise<GitActionResult> =>
    stageAll(folderPath)
  )

  ipcMain.handle(IPC.GIT_UNSTAGE_ALL, (_event, folderPath: string): Promise<GitActionResult> =>
    unstageAll(folderPath)
  )

  ipcMain.handle(
    IPC.GIT_COMMIT,
    (_event, args: { folderPath: string; message: string }): Promise<GitActionResult> =>
      commit(args.folderPath, args.message)
  )

  ipcMain.handle(IPC.GIT_PUSH, (_event, folderPath: string): Promise<GitActionResult> =>
    pushBranch(folderPath)
  )

  ipcMain.handle(IPC.GIT_PULL, (_event, folderPath: string): Promise<GitActionResult> =>
    pullBranch(folderPath)
  )

  ipcMain.handle(
    IPC.GIT_LOG,
    (_event, folderPath: string, limit?: number): Promise<GitLogEntry[]> =>
      getGitLog(
        folderPath,
        typeof limit === 'number' && limit > 0 ? Math.min(limit, 1000) : undefined
      )
  )

  ipcMain.handle(
    IPC.GIT_SHOW_COMMIT,
    (_event, args: { folderPath: string; hash: string }): Promise<GitDiffFile[]> =>
      getCommitDiff(args.folderPath, args.hash)
  )
}
