import { app } from 'electron'
import * as os from 'os'
import * as path from 'path'

/**
 * Shared helpers for locating Claude CLI data on disk. Kept separate from the
 * usage + statusline services so both can import them without a cycle.
 */

export function homeDir(): string {
  return app.isReady() ? app.getPath('home') : os.homedir()
}

/** Where the Superior status-line wrapper dumps each session's status JSON. */
export function statusDir(): string {
  return path.join(app.getPath('userData'), 'claude-status')
}

/** Expand a leading ~, $HOME/${HOME}, or %USERPROFILE% to the home directory. */
export function expandHome(raw: string): string {
  const home = homeDir()
  const trimmed = raw.trim().replace(/^["']|["']$/g, '')
  const expanded = trimmed
    .replace(/^~(?=[/\\]|$)/, home)
    .replace(/\$\{HOME\}|\$HOME/g, home)
    .replace(/%USERPROFILE%/gi, home)
  return path.normalize(expanded)
}

/**
 * Decide whether a command runs a Claude CLI and, if so, which config dir holds
 * its transcripts + settings. Returns null for any non-Claude command.
 *
 * A plain `claude` reads `~/.claude`; a custom-memory variant
 * (`CLAUDE_CONFIG_DIR=$HOME/.claude-cs claude`, or a bare `claude-cs` alias)
 * reads `~/.claude-cs`. So each variant's usage stays in its own store.
 */
export function resolveClaudeConfigDir(command: string): string | null {
  const trimmed = command.trim()
  if (!trimmed) return null

  // An explicit override always wins, in either the POSIX (`VAR=val`) or the
  // Windows (`set "VAR=val"`) form the custom-memory presets emit.
  const override = trimmed.match(/CLAUDE_CONFIG_DIR=(?:"([^"]*)"|'([^']*)'|([^\s"&]+))/)
  if (override) return expandHome(override[1] ?? override[2] ?? override[3] ?? '')

  // The executable is the first real token after any `VAR=val` prefixes and past
  // the last `&&` (handles `set ... && claude`).
  const segment = trimmed.split('&&').pop() ?? trimmed
  const tokens = segment.trim().split(/\s+/)
  let exe = ''
  for (const tok of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok)) continue // inline env assignment
    if (tok === 'set' || tok === 'env' || tok === 'command') continue // common prefixes
    exe = tok
    break
  }
  const base = path.basename(exe.replace(/["']/g, '')).toLowerCase()
  if (base === 'claude') return path.join(homeDir(), '.claude')
  // A `claude-<name>` alias maps to the `~/.claude-<name>` config dir by the same
  // convention the custom-memory feature uses.
  if (base.startsWith('claude-')) return path.join(homeDir(), `.${base}`)
  return null
}

/** Claude encodes a project's cwd into its transcript dir name by replacing every
 *  non-alphanumeric character with a dash. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}
