import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type {
  GitDiff,
  GitDiffFile,
  GitDiffHunk,
  GitDiffLine,
  GitStatus
} from '@shared/types'
import { isValidWorkspaceDir } from './workspace.service'

const execFileAsync = promisify(execFile)

async function git(folderPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', folderPath, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
    windowsHide: true
  })
  return stdout.trim()
}

/** Like {@link git} but returns raw stdout (no trim) and tolerates large diffs. */
async function gitRaw(folderPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', folderPath, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  })
  return stdout
}

function errorMessage(err: unknown): string {
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

export async function getGitStatus(folderPath: string): Promise<GitStatus> {
  if (!isValidWorkspaceDir(folderPath)) {
    return { isRepository: false, branch: null, error: 'Workspace folder is invalid.' }
  }

  try {
    const inside = await git(folderPath, ['rev-parse', '--is-inside-work-tree'])
    if (inside !== 'true') return { isRepository: false, branch: null }
    return { isRepository: true, branch: await currentBranch(folderPath) }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') {
      return { isRepository: false, branch: null, error: errorMessage(err) }
    }
    return { isRepository: false, branch: null }
  }
}

export async function initGit(folderPath: string): Promise<GitStatus> {
  if (!isValidWorkspaceDir(folderPath)) {
    return { isRepository: false, branch: null, error: 'Workspace folder is invalid.' }
  }

  try {
    await git(folderPath, ['init'])
    return getGitStatus(folderPath)
  } catch (err) {
    return { isRepository: false, branch: null, error: errorMessage(err) }
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

/** Parse a unified `git diff` into structured per-file hunks. */
function parseUnifiedDiff(raw: string): GitDiffFile[] {
  const files: GitDiffFile[] = []
  // Drop only the trailing newline git appends, so the last line isn't a phantom.
  const lines = (raw.endsWith('\n') ? raw.slice(0, -1) : raw).split('\n')
  let current: GitDiffFile | null = null
  let oldNo = 0
  let newNo = 0
  let i = 0

  const flush = (): void => {
    if (current) files.push(current)
    current = null
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('diff --git')) {
      flush()
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      current = {
        path: m ? m[2] : '',
        oldPath: null,
        status: 'modified',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        hunks: []
      }
      i++
      continue
    }

    if (!current) {
      i++
      continue
    }

    if (line.startsWith('new file mode')) {
      current.status = 'added'
    } else if (line.startsWith('deleted file mode')) {
      current.status = 'deleted'
    } else if (line.startsWith('rename from ')) {
      current.oldPath = line.slice('rename from '.length)
      current.status = 'renamed'
    } else if (line.startsWith('rename to ')) {
      current.path = line.slice('rename to '.length)
      current.status = 'renamed'
    } else if (line.startsWith('Binary files')) {
      current.binary = true
      current.truncated = true
    } else if (line.startsWith('+++ ')) {
      const p = line.slice(4)
      if (p.startsWith('b/')) current.path = p.slice(2)
    } else if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldNo = m ? parseInt(m[1], 10) : 0
      newNo = m ? parseInt(m[2], 10) : 0
      const hunk: GitDiffHunk = { header: line, lines: [] }
      current.hunks.push(hunk)
      i++
      while (i < lines.length) {
        const hl = lines[i]
        if (hl.startsWith('diff --git') || hl.startsWith('@@')) break
        if (hl.startsWith('\\')) {
          i++
          continue // "\ No newline at end of file"
        }
        const tag = hl[0]
        const content = hl.slice(1)
        if (tag === '+') {
          hunk.lines.push({ type: 'add', content, oldLine: null, newLine: newNo++ })
          current.additions++
        } else if (tag === '-') {
          hunk.lines.push({ type: 'del', content, oldLine: oldNo++, newLine: null })
          current.deletions++
        } else if (tag === ' ') {
          hunk.lines.push({ type: 'context', content, oldLine: oldNo++, newLine: newNo++ })
        } else {
          break // not part of this hunk (e.g. trailing metadata)
        }
        i++
      }
      continue
    }
    i++
  }

  flush()
  return files
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
      error: errorMessage(err)
    }
  }
}
