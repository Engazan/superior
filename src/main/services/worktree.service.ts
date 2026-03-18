import { createHash, randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { WORKTREE_ERROR, type BranchInfo } from '@shared/types'
import { userDataFile } from '../lib/jsonStore'
import { canonicalPath } from './workspace.service'
import { runGit, runGitRaw } from './git.service'

/**
 * Git-worktree lifecycle. Worktree checkouts are app-managed and live under
 * `userData/worktrees/<repoId>/<branchSlug>-<uuid>` — hidden from the user's
 * project tree, owned by the app for clean creation/removal. Every creating
 * command runs in the main repo dir (-C folderPath) and targets the worktree
 * path as an argument. Pre-checks throw {@link WORKTREE_ERROR} codes; raw git
 * failures propagate their stderr.
 */

/** Base dir for all app-managed worktrees. */
function worktreesRoot(): string {
  return userDataFile('worktrees')
}

/** Stable per-repo bucket id, derived from the canonical repo path. */
function repoId(folderPath: string): string {
  return createHash('sha256').update(canonicalPath(folderPath)).digest('hex').slice(0, 12)
}

/** Filesystem-safe, bounded slug for a branch name. */
function branchSlug(branch: string): string {
  const slug = branch
    .replace(/[/\\]/g, '-')
    .replace(/[^\w.-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'branch'
}

async function isGitRepo(folderPath: string): Promise<boolean> {
  try {
    return (await runGit(folderPath, ['rev-parse', '--is-inside-work-tree'])) === 'true'
  } catch {
    return false
  }
}

interface WorktreeEntry {
  path: string
  branch: string | null
}

/** Parse `git worktree list --porcelain` into path + branch entries. */
function parseWorktreeList(raw: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let cur: WorktreeEntry | null = null
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) entries.push(cur)
      cur = { path: line.slice('worktree '.length), branch: null }
    } else if (line.startsWith('branch ') && cur) {
      // e.g. "branch refs/heads/feature" → "feature"
      cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    }
  }
  if (cur) entries.push(cur)
  return entries
}

async function listWorktrees(folderPath: string): Promise<WorktreeEntry[]> {
  const raw = await runGitRaw(folderPath, ['worktree', 'list', '--porcelain'])
  return parseWorktreeList(raw)
}

/** Local branches, marking the current HEAD and any already checked out in a worktree. */
export async function listBranches(folderPath: string): Promise<BranchInfo[]> {
  if (!(await isGitRepo(folderPath))) return []
  const [refs, worktrees] = await Promise.all([
    runGitRaw(folderPath, [
      'for-each-ref',
      '--format=%(refname:short)%09%(HEAD)',
      'refs/heads'
    ]),
    listWorktrees(folderPath)
  ])
  const checkedOut = new Set(worktrees.map((w) => w.branch).filter(Boolean) as string[])
  return refs
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, head] = line.split('\t')
      return { name, isCurrent: head === '*', isCheckedOut: checkedOut.has(name) }
    })
}

export interface CreateWorktreeResult {
  worktreePath: string
  branch: string
}

/**
 * Create a worktree for `branch`. `createBranch` → new branch from HEAD;
 * otherwise check out an existing branch (which must not already be checked
 * out elsewhere). Returns the canonical worktree path. Throws a
 * {@link WORKTREE_ERROR} code on a pre-check failure.
 */
export async function createWorktree(
  folderPath: string,
  branch: string,
  createBranch: boolean
): Promise<CreateWorktreeResult> {
  if (!(await isGitRepo(folderPath))) throw new Error(WORKTREE_ERROR.NOT_A_REPO)

  const branches = await listBranches(folderPath)
  const existing = branches.find((b) => b.name === branch)
  if (createBranch && existing) throw new Error(WORKTREE_ERROR.BRANCH_EXISTS)
  if (!createBranch) {
    if (!existing) throw new Error(WORKTREE_ERROR.BRANCH_EXISTS) // asked for existing, none found
    if (existing.isCheckedOut) throw new Error(WORKTREE_ERROR.BRANCH_CHECKED_OUT)
  }

  const dir = path.join(worktreesRoot(), repoId(folderPath))
  fs.mkdirSync(dir, { recursive: true })
  const wtPath = path.join(dir, `${branchSlug(branch)}-${randomUUID().slice(0, 8)}`)

  const args = createBranch
    ? ['worktree', 'add', '-b', branch, wtPath, 'HEAD']
    : ['worktree', 'add', wtPath, branch]
  await runGit(folderPath, args)

  return { worktreePath: canonicalPath(wtPath), branch }
}

/** Remove a worktree. Without `force`, git refuses if the tree is dirty (safe). */
export async function removeWorktree(
  folderPath: string,
  worktreePath: string,
  opts: { force: boolean }
): Promise<void> {
  const args = ['worktree', 'remove', ...(opts.force ? ['--force'] : []), worktreePath]
  await runGit(folderPath, args)
  // Drop the now-empty per-repo bucket if nothing else lives there.
  try {
    fs.rmdirSync(path.dirname(worktreePath))
  } catch {
    /* not empty or already gone — fine */
  }
}

/** True if the worktree has uncommitted changes (tracked or untracked). */
export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  try {
    const out = await runGitRaw(worktreePath, ['status', '--porcelain'])
    return out.trim().length > 0
  } catch {
    // Unreadable (e.g. dir removed) — treat as not-dirty so removal can proceed.
    return false
  }
}

/** Drop stale worktree admin entries (after out-of-band dir deletion). */
export async function pruneWorktrees(folderPath: string): Promise<void> {
  try {
    await runGit(folderPath, ['worktree', 'prune'])
  } catch {
    /* best effort */
  }
}

/** Live worktree paths known to git (canonical), for startup reconciliation. */
export async function existingWorktreePaths(folderPath: string): Promise<Set<string>> {
  try {
    const list = await listWorktrees(folderPath)
    return new Set(list.map((w) => canonicalPath(w.path)))
  } catch {
    return new Set()
  }
}
