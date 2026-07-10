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
import { handle } from './handle'

export function registerGitIpc(): void {
  handle(IPC.GIT_STATUS, (folderPath: string): Promise<GitStatus> =>
    getGitStatus(folderPath)
  )

  handle(IPC.GIT_INIT, (folderPath: string): Promise<GitStatus> =>
    initGit(folderPath)
  )

  handle(IPC.GIT_DIFF, (folderPath: string): Promise<GitDiff> =>
    getGitDiff(folderPath)
  )

  handle(
    IPC.GIT_SWITCH_BRANCH,
    (
      args: { folderPath: string; branch: string; opts?: { stash?: boolean } }
    ): Promise<BranchSwitchResult> => switchBranch(args.folderPath, args.branch, args.opts ?? {})
  )

  handle(
    IPC.GIT_CREATE_BRANCH,
    (args: { folderPath: string; branch: string }): Promise<BranchSwitchResult> =>
      createBranch(args.folderPath, args.branch)
  )

  handle(
    IPC.GIT_STAGE,
    (args: { folderPath: string; path: string }): Promise<GitActionResult> =>
      stageFile(args.folderPath, args.path)
  )

  handle(
    IPC.GIT_UNSTAGE,
    (args: { folderPath: string; path: string }): Promise<GitActionResult> =>
      unstageFile(args.folderPath, args.path)
  )

  handle(IPC.GIT_STAGE_ALL, (folderPath: string): Promise<GitActionResult> =>
    stageAll(folderPath)
  )

  handle(IPC.GIT_UNSTAGE_ALL, (folderPath: string): Promise<GitActionResult> =>
    unstageAll(folderPath)
  )

  handle(
    IPC.GIT_COMMIT,
    (args: { folderPath: string; message: string }): Promise<GitActionResult> =>
      commit(args.folderPath, args.message)
  )

  handle(IPC.GIT_PUSH, (folderPath: string): Promise<GitActionResult> =>
    pushBranch(folderPath)
  )

  handle(IPC.GIT_PULL, (folderPath: string): Promise<GitActionResult> =>
    pullBranch(folderPath)
  )

  handle(
    IPC.GIT_LOG,
    (folderPath: string, limit?: number): Promise<GitLogEntry[]> =>
      getGitLog(
        folderPath,
        typeof limit === 'number' && limit > 0 ? Math.min(limit, 1000) : undefined
      )
  )

  handle(
    IPC.GIT_SHOW_COMMIT,
    (args: { folderPath: string; hash: string }): Promise<GitDiffFile[]> =>
      getCommitDiff(args.folderPath, args.hash)
  )
}
