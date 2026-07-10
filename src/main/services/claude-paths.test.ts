import * as os from 'os'
import * as path from 'path'
import { describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ getPath: vi.fn(), isReady: vi.fn(() => true) }))

vi.mock('electron', () => ({ app: electron }))

import { encodeProjectDir, expandHome, resolveClaudeConfigDir } from './claude-paths'

describe('Claude path helpers', () => {
  const home = path.join(os.tmpdir(), 'superior-home')

  electron.getPath.mockImplementation((name: string) => (name === 'home' ? home : path.join(home, name)))

  it('expands home-directory notation and strips surrounding quotes', () => {
    expect(expandHome('~/work')).toBe(path.join(home, 'work'))
    expect(expandHome('"${HOME}/work"')).toBe(path.join(home, 'work'))
    expect(expandHome('%USERPROFILE%\\work')).toBe(path.normalize(`${home}\\work`))
  })

  it('finds the default Claude directory and custom aliases', () => {
    expect(resolveClaudeConfigDir('env FOO=1 claude --resume')).toBe(path.join(home, '.claude'))
    expect(resolveClaudeConfigDir('claude-team --dangerously-skip-permissions')).toBe(
      path.join(home, '.claude-team')
    )
    expect(resolveClaudeConfigDir('codex')).toBeNull()
  })

  it('honors POSIX and Windows config-directory overrides', () => {
    expect(resolveClaudeConfigDir('CLAUDE_CONFIG_DIR="$HOME/.claude-work" claude')).toBe(
      path.join(home, '.claude-work')
    )
    expect(resolveClaudeConfigDir('set "CLAUDE_CONFIG_DIR=~/.claude-win" && claude')).toBe(
      path.join(home, '.claude-win')
    )
  })

  it('encodes transcript project directory names predictably', () => {
    expect(encodeProjectDir('/Users/alice/my project')).toBe('-Users-alice-my-project')
  })
})
