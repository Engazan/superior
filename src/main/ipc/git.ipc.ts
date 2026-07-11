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
import { boundedString, invalidPayload, isPathArgs, isRecord } from './validation'

export function registerGitIpc(): void {
  handle(IPC.GIT_STATUS, (folderPath: string): Promise<GitStatus> =>
    boundedString(folderPath) ? getGitStatus(folderPath) : invalidPayload()
  )

  handle(IPC.GIT_INIT, (folderPath: string): Promise<GitStatus> =>
    boundedString(folderPath) ? initGit(folderPath) : invalidPayload()
  )

  handle(IPC.GIT_DIFF, (folderPath: string): Promise<GitDiff> =>
    boundedString(folderPath) ? getGitDiff(folderPath) : invalidPayload()
  )

  handle(
    IPC.GIT_SWITCH_BRANCH,
    (
      args: { folderPath: string; branch: string; opts?: { stash?: boolean } }
    ): Promise<BranchSwitchResult> =>
      isRecord(args) &&
      boundedString(args.folderPath) &&
      boundedString(args.branch, 1_000) &&
      (args.opts === undefined ||
        (isRecord(args.opts) &&
          (args.opts.stash === undefined || typeof args.opts.stash === 'boolean')))
        ? switchBranch(args.folderPath, args.branch, args.opts ?? {})
        : invalidPayload()
  )

  handle(
    IPC.GIT_CREATE_BRANCH,
    (args: { folderPath: string; branch: string }): Promise<BranchSwitchResult> =>
      isRecord(args) && boundedString(args.folderPath) && boundedString(args.branch, 1_000)
        ? createBranch(args.folderPath, args.branch)
        : invalidPayload()
  )

  handle(
    IPC.GIT_STAGE,
    (args: { folderPath: string; path: string }): Promise<GitActionResult> =>
      isPathArgs(args) ? stageFile(args.folderPath, args.path) : invalidPayload()
  )

  handle(
    IPC.GIT_UNSTAGE,
    (args: { folderPath: string; path: string }): Promise<GitActionResult> =>
      isPathArgs(args) ? unstageFile(args.folderPath, args.path) : invalidPayload()
  )

  handle(IPC.GIT_STAGE_ALL, (folderPath: string): Promise<GitActionResult> =>
    boundedString(folderPath) ? stageAll(folderPath) : invalidPayload()
  )

  handle(IPC.GIT_UNSTAGE_ALL, (folderPath: string): Promise<GitActionResult> =>
    boundedString(folderPath) ? unstageAll(folderPath) : invalidPayload()
  )

  handle(
    IPC.GIT_COMMIT,
    (args: { folderPath: string; message: string }): Promise<GitActionResult> =>
      isRecord(args) && boundedString(args.folderPath) && boundedString(args.message, 100_000)
        ? commit(args.folderPath, args.message)
        : invalidPayload()
  )

  handle(IPC.GIT_PUSH, (folderPath: string): Promise<GitActionResult> =>
    boundedString(folderPath) ? pushBranch(folderPath) : invalidPayload()
  )

  handle(IPC.GIT_PULL, (folderPath: string): Promise<GitActionResult> =>
    boundedString(folderPath) ? pullBranch(folderPath) : invalidPayload()
  )

  handle(
    IPC.GIT_LOG,
    (folderPath: string, limit?: number): Promise<GitLogEntry[]> =>
      boundedString(folderPath) ? getGitLog(
        folderPath,
        typeof limit === 'number' && limit > 0 ? Math.min(limit, 1000) : undefined
      ) : invalidPayload()
  )

  handle(
    IPC.GIT_SHOW_COMMIT,
    (args: { folderPath: string; hash: string }): Promise<GitDiffFile[]> =>
      isRecord(args) && boundedString(args.folderPath) && boundedString(args.hash, 40)
        ? getCommitDiff(args.folderPath, args.hash)
        : invalidPayload()
  )
}
