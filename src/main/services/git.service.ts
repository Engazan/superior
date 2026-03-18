import { execFile } from 'child_process'
import { promisify } from 'util'
import type { GitStatus } from '@shared/types'
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
