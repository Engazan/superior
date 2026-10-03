import * as fs from 'fs'
import * as path from 'path'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'
import { expandHome, homeDir, resolveClaudeConfigDir } from './claude-paths'

/**
 * Claude reports its exact turn state (working / waiting for permission / done)
 * through hooks. Superior adds one inline hook per event to the config dir's
 * settings.json. The hook only writes where Superior's per-terminal env vars
 * point, so a Claude started outside Superior just drains stdin and continues.
 *
 * Codex accepts the same hook shape in `<CODEX_HOME>/hooks.json`, so the same
 * inline hook reports Codex turns too. Codex asks the user once to trust it.
 *
 * POSIX only: Windows keeps title- and output-based detection.
 */

// Only events Claude has shipped for a long time, so older CLIs never see an unknown key.
const EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SessionEnd']
// SessionStart carries no state but reports the transcript path before the first prompt.
const CODEX_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop']
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PermissionRequest'])
const MARKER = 'SUPERIOR_AGENT_STATE_DIR'

export const CLAUDE_STATE_HOOK =
  '[ -n "$SUPERIOR_AGENT_STATE_DIR" ] && [ -n "$SUPERIOR_SESSION_ID" ] && ' +
  'f="$SUPERIOR_AGENT_STATE_DIR/$SUPERIOR_SESSION_ID" && cat > "$f.$$.tmp" && mv -f "$f.$$.tmp" "$f.json" ' +
  '|| cat > /dev/null; exit 0'

type Settings = Record<string, unknown> & { hooks?: unknown }
type Group = { matcher?: string; hooks?: { type?: string; command?: string; timeout?: number }[] }

function isOurGroup(group: unknown): boolean {
  const hooks = (group as Group | null)?.hooks
  return Array.isArray(hooks) && hooks.length === 1 && typeof hooks[0]?.command === 'string' &&
    hooks[0].command.includes(MARKER)
}

/**
 * Settings with exactly one current Superior hook per event; null when `hooks` is not ours to edit.
 * Codex hooks carry no matcher and fire for every tool.
 */
export function withStateHooks(settings: Settings, codex = false): Settings | null {
  const base = settings.hooks ?? {}
  if (typeof base !== 'object' || Array.isArray(base)) return null
  const hooks: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const event of codex ? CODEX_EVENTS : EVENTS) {
    const current = hooks[event] ?? []
    if (!Array.isArray(current)) return null
    const group: Group = {
      ...(!codex && TOOL_EVENTS.has(event) ? { matcher: '*' } : {}),
      hooks: [{ type: 'command', command: CLAUDE_STATE_HOOK, timeout: 5 }]
    }
    hooks[event] = [...current.filter((g) => !isOurGroup(g)), group]
  }
  return { ...settings, hooks }
}

/** Settings without any Superior hook; other hooks are kept untouched. */
export function withoutStateHooks(settings: Settings): Settings {
  const base = settings.hooks
  if (!base || typeof base !== 'object' || Array.isArray(base)) return settings
  const hooks: Record<string, unknown> = {}
  for (const [event, groups] of Object.entries(base)) {
    if (!Array.isArray(groups)) { hooks[event] = groups; continue }
    const kept = groups.filter((g) => !isOurGroup(g))
    if (kept.length) hooks[event] = kept
  }
  const next = { ...settings }
  if (Object.keys(hooks).length) next.hooks = hooks
  else delete next.hooks
  return next
}

function readSettings(file: string): Settings | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Settings : null
  } catch (err) {
    // Never clobber settings we cannot parse; a missing file is created.
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? {} : null
  }
}

function rewrite(
  configDir: string,
  change: (s: Settings) => Settings | null,
  name = 'settings.json'
): boolean {
  const file = path.join(configDir, name)
  const settings = readSettings(file)
  const next = settings && change(settings)
  if (!next) return false
  if (JSON.stringify(next) === JSON.stringify(settings)) return true
  fs.mkdirSync(configDir, { recursive: true })
  // Atomic replace so a starting Claude never reads a half-written file.
  const tmp = `${file}.superior.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf-8')
  fs.renameSync(tmp, file)
  return true
}

const registryFile = (): string => userDataFile('claude-state-hooks.json')
const installedDirs = (): string[] =>
  readJsonFile<string[]>(registryFile(), [], (v) => Array.isArray(v) ? v.filter((d) => typeof d === 'string') : [])

/** Install the hooks into the config dir backing `command`. Best effort; a no-op for non-Claude commands. */
export function ensureClaudeStateHooks(command: string): void {
  if (process.platform === 'win32') return
  const configDir = resolveClaudeConfigDir(command)
  if (!configDir) return
  try {
    if (!rewrite(configDir, withStateHooks)) return
    const dirs = installedDirs()
    if (!dirs.includes(configDir)) writeJsonFile(registryFile(), [...dirs, configDir], 'Claude hook registry')
  } catch { /* Detection falls back to the terminal title and output. */ }
}

/** Remove the hooks from every config dir they were installed into. */
export function removeAllClaudeStateHooks(): void {
  if (process.platform === 'win32') return
  const remaining = installedDirs().filter((dir) => {
    try { return !rewrite(dir, withoutStateHooks) } catch { return true }
  })
  try { writeJsonFile(registryFile(), remaining, 'Claude hook registry') } catch { /* retried next time */ }
}

/**
 * CODEX_HOME for a command that runs the Codex CLI, or null. An inline
 * `CODEX_HOME=...` wins; otherwise the env var, then `~/.codex`.
 */
export function resolveCodexHome(command: string): string | null {
  const segment = (command.trim().split('&&').pop() ?? '').trim()
  const override = segment.match(/CODEX_HOME=(?:"([^"]*)"|'([^']*)'|(\S+))/)
  const exe = segment.split(/\s+/).find((tok) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok) && tok !== 'env') ?? ''
  if (path.basename(exe.replace(/["']/g, '')).toLowerCase() !== 'codex') return null
  if (override) return expandHome(override[1] ?? override[2] ?? override[3] ?? '')
  return process.env.CODEX_HOME ? expandHome(process.env.CODEX_HOME) : path.join(homeDir(), '.codex')
}

const codexRegistryFile = (): string => userDataFile('codex-state-hooks.json')
const codexDirs = (): string[] =>
  readJsonFile<string[]>(codexRegistryFile(), [], (v) => Array.isArray(v) ? v.filter((d) => typeof d === 'string') : [])

/** Install the hooks into an existing CODEX_HOME's hooks.json. Best effort; a no-op for non-Codex commands. */
export function ensureCodexStateHooks(command: string): void {
  if (process.platform === 'win32') return
  const home = resolveCodexHome(command)
  // Never create a Codex home for a CLI that has not run yet.
  if (!home || !fs.existsSync(home)) return
  try {
    if (!rewrite(home, (s) => withStateHooks(s, true), 'hooks.json')) return
    const dirs = codexDirs()
    if (!dirs.includes(home)) writeJsonFile(codexRegistryFile(), [...dirs, home], 'Codex hook registry')
  } catch { /* Detection falls back to the terminal title and output. */ }
}

/** Remove the hooks from every Codex home they were installed into. */
export function removeAllCodexStateHooks(): void {
  if (process.platform === 'win32') return
  const remaining = codexDirs().filter((dir) => {
    try { return !rewrite(dir, withoutStateHooks, 'hooks.json') } catch { return true }
  })
  try { writeJsonFile(codexRegistryFile(), remaining, 'Codex hook registry') } catch { /* retried next time */ }
}
