import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { GitDiff, GitDiffFile, GitDiffLine, GitStatus } from '@shared/types'
import { isWithinWorkspaceFolder } from './workspace.service'
import { parseUnifiedDiff } from './git.diff'

const execFileAsync = promisify(execFile)

/**
 * Run a git command in `dir` and return trimmed stdout. Exported so sibling
 * services (e.g. worktree.service) share one exec wrapper with consistent
 * timeout / windowsHide behavior. Rejects with the raw child_process error
 * (use {@link gitErrorMessage} to render it).
 */
export async function runGit(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', dir, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
    windowsHide: true
  })
  return stdout.trim()
}

/** Like {@link runGit} but returns raw stdout (no trim) and tolerates large output. */
export async function runGitRaw(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', dir, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  })
  return stdout
}

// Local aliases keep the rest of this file terse.
const git = runGit
const gitRaw = runGitRaw

/** Render a git/child_process error into a user-facing message. */
export function gitErrorMessage(err: unknown): string {
  const e = err as NodeJS.ErrnoException & { stderr?: string }
  if (e.code === 'ENOENT') return 'Git is not installed or is not available on PATH.'
  return e.stderr?.trim() || e.message || 'Git command failed.'
}

async function currentBranch(folderPath: string): Promise<string> {
  try {
    return await git(folderPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
  } catch {
    try {
      const commit = await git(folderPath, ['rev-parse', '--short', 'HEAD'])
      return `detached@${commit}`
    } catch {
      return 'HEAD'
    }
  }
}

/**
 * Cheap working-tree summary for the title bar: changed-file count plus total
 * added/removed lines. Uses `--numstat` (no hunk parsing) for tracked changes
 * and reads untracked files as all-additions, mirroring {@link getGitDiff}'s
 * totals without the cost of building diff hunks. Bounded so polling stays light.
 */
async function getDiffStats(
  folderPath: string
): Promise<{ changedFiles: number; additions: number; deletions: number }> {
  let changedFiles = 0
  let additions = 0
  let deletions = 0

  const base = (await hasCommits(folderPath)) ? ['diff', 'HEAD'] : ['diff', '--cached']
  const numstat = await gitRaw(folderPath, [...base, '--numstat', '--no-ext-diff', '-M'])
  for (const line of numstat.split('\n')) {
    if (!line.trim()) continue
    changedFiles++
    const [add, del] = line.split('\t')
    // Binary files report '-' for both columns; count them as a changed file only.
    if (add !== '-') additions += Number(add) || 0
    if (del !== '-') deletions += Number(del) || 0
  }

  for (const rel of await listUntracked(folderPath)) {
    changedFiles++
    additions += await countUntrackedLines(folderPath, rel)
  }

  return { changedFiles, additions, deletions }
}

/** Line count of an untracked file, treated as all-additions (0 for binary/oversized). */
async function countUntrackedLines(folderPath: string, rel: string): Promise<number> {
  try {
    const buf = await readFile(join(folderPath, rel))
    if (buf.includes(0) || buf.byteLength > MAX_UNTRACKED_BYTES) return 0
    const rows = buf.toString('utf-8').split('\n')
    if (rows.length && rows[rows.length - 1] === '') rows.pop()
    return rows.length
  } catch {
    return 0
  }
}

export async function getGitStatus(folderPath: string): Promise<GitStatus> {
  if (!isWithinWorkspaceFolder(folderPath)) {
    return { isRepository: false, branch: null, error: 'Workspace folder is invalid.' }
  }

  try {
    const inside = await git(folderPath, ['rev-parse', '--is-inside-work-tree'])
    if (inside !== 'true') return { isRepository: false, branch: null }
    const branch = await currentBranch(folderPath)
    const stats = await getDiffStats(folderPath)
    return { isRepository: true, branch, ...stats }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') {
      return { isRepository: false, branch: null, error: gitErrorMessage(err) }
    }
    return { isRepository: false, branch: null }
  }
}

export async function initGit(folderPath: string): Promise<GitStatus> {
  if (!isWithinWorkspaceFolder(folderPath)) {
    return { isRepository: false, branch: null, error: 'Workspace folder is invalid.' }
  }

  try {
    await git(folderPath, ['init'])
    return getGitStatus(folderPath)
  } catch (err) {
    return { isRepository: false, branch: null, error: gitErrorMessage(err) }
  }
}

// Untracked files are read directly and shown as all-additions; skip anything
// bigger than this so a stray large/binary file can't bloat the diff payload.
const MAX_UNTRACKED_BYTES = 512 * 1024

const emptyTotals = { files: 0, additions: 0, deletions: 0 }

async function hasCommits(folderPath: string): Promise<boolean> {
  try {
    await git(folderPath, ['rev-parse', '--verify', '--quiet', 'HEAD'])
    return true
  } catch {
    return false
  }
}

async function listUntracked(folderPath: string): Promise<string[]> {
  const out = await gitRaw(folderPath, ['ls-files', '--others', '--exclude-standard', '-z'])
  return out.split('\0').filter(Boolean)
}

/** Build an all-additions entry for an untracked file by reading its content. */
async function untrackedEntry(folderPath: string, rel: string): Promise<GitDiffFile> {
  const base: GitDiffFile = {
    path: rel,
    oldPath: null,
    status: 'untracked',
    additions: 0,
    deletions: 0,
    binary: false,
    truncated: false,
    hunks: []
  }
  try {
    const buf = await readFile(join(folderPath, rel))
    const binary = buf.includes(0)
    if (binary || buf.byteLength > MAX_UNTRACKED_BYTES) {
      return { ...base, binary, truncated: true }
    }
    const rows = buf.toString('utf-8').split('\n')
    if (rows.length && rows[rows.length - 1] === '') rows.pop()
    const lines: GitDiffLine[] = rows.map((content, i) => ({
      type: 'add',
      content,
      oldLine: null,
      newLine: i + 1
    }))
    return {
      ...base,
      additions: lines.length,
      hunks: lines.length ? [{ header: `@@ -0,0 +1,${lines.length} @@`, lines }] : []
    }
  } catch {
    return { ...base, truncated: true }
  }
}

export async function getGitDiff(folderPath: string): Promise<GitDiff> {
  const status = await getGitStatus(folderPath)
  if (!status.isRepository) {
    return { isRepository: false, branch: null, files: [], totals: emptyTotals, error: status.error }
  }

  try {
    // Compare the working tree against HEAD once there's a commit; before the
    // first commit, fall back to the index so staged files still show up.
    const base = (await hasCommits(folderPath)) ? ['diff', 'HEAD'] : ['diff', '--cached']
    const raw = await gitRaw(folderPath, [...base, '--no-color', '--no-ext-diff', '-M'])
    const files = parseUnifiedDiff(raw)

    for (const rel of await listUntracked(folderPath)) {
      files.push(await untrackedEntry(folderPath, rel))
    }

    const totals = files.reduce(
      (acc, f) => ({
        files: acc.files + 1,
        additions: acc.additions + f.additions,
        deletions: acc.deletions + f.deletions
      }),
      { ...emptyTotals }
    )
    return { isRepository: true, branch: status.branch, files, totals }
  } catch (err) {
    return {
      isRepository: true,
      branch: status.branch,
      files: [],
      totals: emptyTotals,
      error: gitErrorMessage(err)
    }
  }
}
