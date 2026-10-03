import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** Run a quick Git probe and return trimmed stdout. */
export async function runGit(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', dir, ...args], {
    encoding: 'utf-8',
    timeout: 5000,
    windowsHide: true
  })
  return stdout.trim()
}

/** Run a read that needs raw/large stdout. */
export async function runGitRaw(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', dir, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  })
  return stdout
}

/** Run a network-bound or mutating Git command with a safe long timeout. */
export async function runGitLong(dir: string, args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', dir, ...args], {
    encoding: 'utf-8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true
  })
}

/** Render a Git/child-process error into a user-facing message. */
export function gitErrorMessage(err: unknown): string {
  const error = err as NodeJS.ErrnoException & { stderr?: string }
  if (error.code === 'ENOENT') return 'Git is not installed or is not available on PATH.'
  return error.stderr?.trim() || error.message || 'Git command failed.'
}
