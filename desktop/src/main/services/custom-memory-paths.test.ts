import { describe, expect, it } from 'vitest'
import {
  customAliasCommand,
  customTerminalCommand,
  parseWslPath,
  unsupportedPathReason,
  wslHomeFor,
  wslToUnc
} from './custom-memory-paths'

const claude = {
  envVar: 'CLAUDE_CONFIG_DIR',
  executable: 'claude',
  terminalArgs: '--dangerously-skip-permissions'
}

describe('custom memory paths', () => {
  it('parses WSL shares in both spellings', () => {
    expect(parseWslPath('\\\\wsl.localhost\\Ubuntu\\home\\me\\.claude-work')).toEqual({
      share: '\\\\wsl.localhost\\Ubuntu',
      distro: 'Ubuntu',
      linuxPath: '/home/me/.claude-work'
    })
    expect(parseWslPath('//wsl$/Debian/root/cfg/')?.linuxPath).toBe('/root/cfg')
    expect(parseWslPath('C:\\Users\\me\\Desktop')).toBeNull()
    expect(wslHomeFor('/home/me/.claude-work')).toBe('/home/me')
    expect(wslHomeFor('/opt/claude')).toBeNull()
    const location = parseWslPath('\\\\wsl$\\Ubuntu\\home\\me\\x')!
    expect(wslToUnc(location, '/home/me/.bashrc')).toBe('\\\\wsl$\\Ubuntu\\home\\me\\.bashrc')
  })

  it('builds commands for native and WSL folders', () => {
    expect(customTerminalCommand(claude, '/Volumes/Data/claude', '/Users/me', 'darwin', 'claude-data'))
      .toBe('CLAUDE_CONFIG_DIR="/Volumes/Data/claude" claude --dangerously-skip-permissions')
    expect(customTerminalCommand(claude, 'D:\\Profiles\\claude work', 'C:\\Users\\me', 'win32', 'claude-work'))
      .toBe('set "CLAUDE_CONFIG_DIR=D:\\Profiles\\claude work" && claude --dangerously-skip-permissions')
    expect(customTerminalCommand(claude, '\\\\wsl.localhost\\Ubuntu\\home\\me\\.claude-work', 'C:\\Users\\me', 'win32', 'claude-work'))
      .toBe(`wsl.exe -d Ubuntu --exec bash -lic "CLAUDE_CONFIG_DIR='/home/me/.claude-work' exec claude --dangerously-skip-permissions \\"$@\\"" claude-work`)
    expect(customAliasCommand(claude, 'claude-work', '\\\\wsl.localhost\\Ubuntu\\home\\me\\.claude-work', 'C:\\Users\\me', 'win32'))
      .toBe(`alias claude-work='CLAUDE_CONFIG_DIR="/home/me/.claude-work" claude'`)
    expect(customAliasCommand(claude, 'claude-work', 'D:\\Profiles\\work', 'C:\\Users\\me', 'win32'))
      .toBe('function claude-work { $env:CLAUDE_CONFIG_DIR="D:\\Profiles\\work"; claude @args }')
  })

  it('rejects paths that cannot be embedded safely', () => {
    expect(unsupportedPathReason('/Users/me/it\'s', 'darwin')).toMatch('unsupported')
    expect(unsupportedPathReason('/Users/me/$HOME', 'linux')).toMatch('unsupported')
    expect(unsupportedPathReason('C:\\100%', 'win32')).toMatch('unsupported')
    expect(unsupportedPathReason('\\\\wsl$\\Ubuntu', 'win32')).toMatch('inside')
    expect(unsupportedPathReason('/Users/me/Desktop/claude', 'darwin')).toBeNull()
    expect(unsupportedPathReason('\\\\wsl.localhost\\Ubuntu-22.04\\home\\me\\c', 'win32')).toBeNull()
  })
})
