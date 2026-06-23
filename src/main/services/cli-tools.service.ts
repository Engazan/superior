import { app } from 'electron'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { CliToolFixResult, CliToolId, CliToolStatus } from '@shared/types'

interface ToolSpec {
  id: CliToolId
  label: string
  executable: string
  /** Provider-specific install dirs to probe first (the native installers' homes). */
  extraDirs: (home: string) => string[]
}

const TOOLS: ToolSpec[] = [
  {
    id: 'claude',
    label: 'Claude',
    executable: 'claude',
    // The native installer drops the binary here and only adds it to PATH via an
    // interactive rc file, which is the exact case this whole feature exists for.
    extraDirs: (home) => [path.join(home, '.claude', 'local')]
  },
  {
    id: 'codex',
    label: 'Codex',
    executable: 'codex',
    extraDirs: (home) => [path.join(home, '.codex', 'bin')]
  }
]

const isWindows = process.platform === 'win32'

function homeDir(): string {
  return app.isReady() ? app.getPath('home') : os.homedir()
}

/**
 * Env handed to the probe shells. Mirrors the daemon's `ptyEnv()` (drop Electron
 * flags) so detection sees exactly the PATH the app's real terminals would —
 * the login shell then augments it from the user's dotfiles just the same.
 */
function probeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith('ELECTRON_')) continue
    env[k] = v
  }
  return env
}

/**
 * Run `command -v <exe>` in the user's shell and return its raw output (a path,
 * or an alias/function definition), or null when the command isn't resolvable.
 * `interactive` adds `-i` so interactive-only rc files (~/.zshrc) are sourced —
 * used to discover a CLI the app's own (non-interactive) shell can't see.
 */
function resolveInShell(exe: string, interactive: boolean): string | null {
  if (isWindows) {
    const shell = process.env.COMSPEC || 'cmd.exe'
    const res = spawnSync(shell, ['/d', '/s', '/c', `where ${exe}`], {
      encoding: 'utf-8',
      timeout: 5000,
      env: probeEnv()
    })
    const out = (res.stdout || '').trim()
    return res.status === 0 && out ? out.split(/\r?\n/)[0].trim() : null
  }
  const shell = process.env.SHELL || '/bin/bash'
  const flags = interactive ? ['-l', '-i', '-c'] : ['-l', '-c']
  const res = spawnSync(shell, [...flags, `command -v ${exe} 2>/dev/null`], {
    encoding: 'utf-8',
    timeout: 5000,
    env: probeEnv()
  })
  if (res.status !== 0) return null
  const out = (res.stdout || '').trim()
  return out || null
}

function isExecutableFile(file: string): boolean {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile()) return false
    if (isWindows) return true
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Pick the first absolute, runnable path out of a shell command's output. */
function firstExecutablePath(output: string | null): string | null {
  if (!output) return null
  for (const line of output.split(/\r?\n/)) {
    const candidate = line.trim()
    if ((candidate.startsWith('/') || (isWindows && /^[a-zA-Z]:\\/.test(candidate))) &&
      isExecutableFile(candidate)) {
      return candidate
    }
  }
  return null
}

/** Common locations a CLI may live in even when it isn't on the app shell's PATH. */
function candidatePaths(spec: ToolSpec): string[] {
  const home = homeDir()
  const dirs = [
    ...spec.extraDirs(home),
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.npm-global', 'bin'),
    path.join(home, 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.deno', 'bin')
  ]
  // npm's global bin, wherever it actually is.
  try {
    const res = spawnSync('npm', ['prefix', '-g'], { encoding: 'utf-8', timeout: 5000, env: probeEnv() })
    const prefix = (res.stdout || '').trim()
    if (prefix) dirs.push(isWindows ? prefix : path.join(prefix, 'bin'))
  } catch {
    /* npm not present — fine */
  }
  const names = isWindows ? [`${spec.executable}.cmd`, `${spec.executable}.exe`] : [spec.executable]
  return dirs.flatMap((dir) => names.map((name) => path.join(dir, name)))
}

function checkOne(spec: ToolSpec): CliToolStatus {
  // The authoritative question: does the app's own login shell resolve it?
  const inAppShell = resolveInShell(spec.executable, false)
  const availableInShell = inAppShell !== null

  // Best-effort absolute path: the app shell's resolution, else known dirs, else
  // the user's interactive shell (which sources ~/.zshrc etc.).
  let installedPath = firstExecutablePath(inAppShell)
  if (!installedPath) installedPath = candidatePaths(spec).find(isExecutableFile) ?? null
  if (!installedPath) installedPath = firstExecutablePath(resolveInShell(spec.executable, true))

  const installed = availableInShell || installedPath !== null
  const fixable = !isWindows && installed && !availableInShell && installedPath !== null

  return {
    id: spec.id,
    label: spec.label,
    executable: spec.executable,
    installed,
    availableInShell,
    installedPath,
    fixable
  }
}

export function checkCliTools(): CliToolStatus[] {
  return TOOLS.map(checkOne)
}

/**
 * The shell env file the app's login shell sources, where a PATH addition will
 * also reach the daemon's non-interactive `$SHELL -l -c` launches. For zsh that's
 * ~/.zshenv (read on every invocation); for bash, its login profile.
 */
function envFile(): string {
  const home = homeDir()
  const shell = path.basename(process.env.SHELL || '')
  if (shell.includes('zsh')) return path.join(home, '.zshenv')
  if (shell.includes('bash')) return path.join(home, '.bash_profile')
  return path.join(home, '.profile')
}

function fileMentions(file: string, needle: string): boolean {
  try {
    return fs.readFileSync(file, 'utf-8').includes(needle)
  } catch {
    return false
  }
}

function appendLine(file: string, line: string): void {
  let prefix = ''
  try {
    const content = fs.readFileSync(file, 'utf-8')
    if (content.length > 0 && !content.endsWith('\n')) prefix = '\n'
  } catch {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }
  fs.appendFileSync(file, `${prefix}${line}\n`, 'utf-8')
}

/**
 * Make a CLI that's installed-but-invisible reachable by the app's shell: add the
 * directory holding its binary to PATH in the shell env file. Idempotent, and a
 * no-op when the tool is already available or can't be located.
 */
export function fixCliTool(id: CliToolId): CliToolFixResult {
  const spec = TOOLS.find((t) => t.id === id)
  if (!spec) return { status: checkCliTools()[0], error: 'not-installed' }

  const status = checkOne(spec)
  if (status.availableInShell) return { status, error: 'already-available' }
  if (isWindows) return { status, error: 'unsupported' }
  if (!status.installedPath) return { status, error: 'not-installed' }

  const dir = path.dirname(status.installedPath)
  const pathLine = `export PATH="${dir}:$PATH"`
  const file = envFile()
  if (!fileMentions(file, pathLine)) {
    appendLine(file, `${pathLine}  # added by Superior to expose ${spec.executable}`)
  }

  return { status: checkOne(spec), fixedFile: path.basename(file) }
}
