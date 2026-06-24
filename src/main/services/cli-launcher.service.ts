import { app } from 'electron'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { ShellCommandInstallResult, ShellCommandStatus } from '@shared/types'
import { isValidWorkspaceDir, canonicalPath } from './workspace.service'

const isWindows = process.platform === 'win32'

/** The shell command users type, e.g. `superior .`. */
const COMMAND_NAME = 'superior'

function homeDir(): string {
  return app.isReady() ? app.getPath('home') : os.homedir()
}

/**
 * Pull a folder path out of a launch argv. Recognizes the explicit `--path <dir>`
 * form our launcher script emits, plus a bare trailing argument that resolves to
 * an existing directory (so `superior <dir>` and `open --args <dir>` also work).
 *
 * `cwd` resolves relative arguments — for a second instance this is the calling
 * shell's working directory that Electron forwards. Cold-start parsing in
 * development is restricted to `--path` so a stray argv (electron-vite passes the
 * project dir) can't silently open a folder; pass `requireFlag` for that case.
 */
export function extractFolderArg(
  argv: string[],
  cwd: string,
  opts: { requireFlag?: boolean } = {}
): string | null {
  const resolve = (p: string): string | null => {
    const abs = path.isAbsolute(p) ? p : path.resolve(cwd, p)
    return isValidWorkspaceDir(abs) ? canonicalPath(abs) : null
  }

  const flagIdx = argv.indexOf('--path')
  if (flagIdx !== -1 && argv[flagIdx + 1]) {
    return resolve(argv[flagIdx + 1])
  }
  if (opts.requireFlag) return null

  // No flag: take the last argument that isn't itself a flag and points at a dir.
  for (let i = argv.length - 1; i >= 1; i--) {
    const arg = argv[i]
    if (arg.startsWith('-')) continue
    const dir = resolve(arg)
    if (dir) return dir
  }
  return null
}

/** Absolute path the launcher script execs to start (or hand a folder to) the app. */
function appExecPath(): string {
  return process.execPath
}

/** Where the `superior` launcher lives once installed (no PATH guarantee). */
function installPath(): string {
  if (isWindows) {
    return path.join(app.getPath('appData'), 'Superior', 'bin', `${COMMAND_NAME}.cmd`)
  }
  return path.join(homeDir(), '.local', 'bin', COMMAND_NAME)
}

/**
 * POSIX launcher: resolve the target to an absolute path (defaulting to the
 * current directory), then exec the app binary directly. Exec-ing the binary —
 * rather than `open -a` — guarantees the folder reaches an already-running
 * instance via Electron's single-instance hand-off.
 */
function posixScript(): string {
  return `#!/bin/sh
# ${COMMAND_NAME} — installed by Superior. Opens a folder in the app.
target="\${1:-.}"
case "$target" in
  -*) target="." ;;
esac
if [ -d "$target" ]; then
  target="$(cd "$target" 2>/dev/null && pwd)"
fi
exec "${appExecPath()}" --path "$target"
`
}

function windowsScript(): string {
  return `@echo off
setlocal
set "TARGET=%~f1"
if "%TARGET%"=="" set "TARGET=%CD%"
start "" "${appExecPath()}" --path "%TARGET%"
`
}

/**
 * Is the command both written to disk and resolvable as `superior` in the user's
 * shell? `resolvable` is what actually matters for the user — the file can exist
 * while its directory is missing from PATH.
 */
export function shellCommandStatus(): ShellCommandStatus {
  const target = installPath()
  const installed = fileExists(target)

  let resolvable = false
  try {
    if (isWindows) {
      const shell = process.env.COMSPEC || 'cmd.exe'
      const res = spawnSync(shell, ['/d', '/s', '/c', `where ${COMMAND_NAME}`], {
        encoding: 'utf-8',
        timeout: 5000
      })
      resolvable = res.status === 0 && !!(res.stdout || '').trim()
    } else {
      const shell = process.env.SHELL || '/bin/bash'
      const res = spawnSync(shell, ['-l', '-c', `command -v ${COMMAND_NAME} 2>/dev/null`], {
        encoding: 'utf-8',
        timeout: 5000
      })
      resolvable = res.status === 0 && !!(res.stdout || '').trim()
    }
  } catch {
    resolvable = false
  }

  return { command: COMMAND_NAME, installed, resolvable, path: installed ? target : null }
}

function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/**
 * Write the `superior` launcher and make sure its directory is on PATH so the
 * command resolves in a fresh shell. Idempotent. On POSIX the binary directory is
 * added to the shell env file the app's login shell sources (matching how CLI
 * tools are exposed); on Windows the user PATH is extended via PowerShell.
 */
export function installShellCommand(): ShellCommandInstallResult {
  const target = installPath()
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, isWindows ? windowsScript() : posixScript(), 'utf-8')
    if (!isWindows) fs.chmodSync(target, 0o755)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const dir = path.dirname(target)
  let pathNote: string | undefined
  if (!shellCommandStatus().resolvable) {
    pathNote = isWindows ? ensureWindowsPath(dir) : ensurePosixPath(dir)
  }

  return { ok: true, path: target, pathNote, resolvable: shellCommandStatus().resolvable }
}

/**
 * Append `dir` to PATH in the shell env file the app's login shell sources. zsh
 * reads ~/.zshenv on every invocation; bash uses its login profile.
 */
function ensurePosixPath(dir: string): string | undefined {
  const home = homeDir()
  const shell = path.basename(process.env.SHELL || '')
  const file = shell.includes('zsh')
    ? path.join(home, '.zshenv')
    : shell.includes('bash')
      ? path.join(home, '.bash_profile')
      : path.join(home, '.profile')

  const line = `export PATH="${dir}:$PATH"`
  try {
    let content = ''
    try {
      content = fs.readFileSync(file, 'utf-8')
    } catch {
      fs.mkdirSync(path.dirname(file), { recursive: true })
    }
    if (!content.includes(line)) {
      const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
      fs.appendFileSync(file, `${prefix}${line}  # added by Superior for the ${COMMAND_NAME} command\n`)
    }
    return path.basename(file)
  } catch {
    return undefined
  }
}

/** Append `dir` to the persistent user PATH (survives reboots) via PowerShell. */
function ensureWindowsPath(dir: string): string | undefined {
  const ps = [
    `$p=[Environment]::GetEnvironmentVariable('Path','User');`,
    `if (($p -split ';') -notcontains '${dir}') {`,
    `  [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';${dir}'), 'User')`,
    `}`
  ].join(' ')
  try {
    const res = spawnSync('powershell', ['-NoProfile', '-Command', ps], { timeout: 8000 })
    return res.status === 0 ? 'PATH' : undefined
  } catch {
    return undefined
  }
}
