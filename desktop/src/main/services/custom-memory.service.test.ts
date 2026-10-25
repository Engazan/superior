import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customMemoryName } from '@shared/custom-memory'

const electron = vi.hoisted(() => ({ getPath: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: electron.getPath, isReady: () => true }, dialog: {} }))
import { createCustomMemoryPreset, addCustomMemoryTerminalPreset, listCustomMemoryPresets, removeCustomMemoryPreset } from './custom-memory.service'

describe('account spaces used by onboarding', () => {
  let root: string
  let home: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-account-setup-'))
    home = path.join(root, 'home')
    const userData = path.join(root, 'data')
    fs.mkdirSync(home)
    fs.mkdirSync(userData)
    fs.writeFileSync(path.join(home, '.zshrc'), '# existing shell configuration\n')
    electron.getPath.mockImplementation((kind: string) => kind === 'home' ? home : userData)
  })
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

  it('creates separate Claude and Codex spaces with matching terminal commands and usage IDs', () => {
    createCustomMemoryPreset('claude', 'Práca')
    const result = createCustomMemoryPreset('codex', 'Personal')
    expect(result.memories.map((item) => item.id)).toEqual(['claude:praca', 'codex:personal'])
    expect(result.memories.every((item) => item.terminalPresetExists && item.aliasExists)).toBe(true)
    expect(fs.statSync(path.join(home, '.claude-praca')).isDirectory()).toBe(true)
    expect(fs.statSync(path.join(home, '.codex-personal')).isDirectory()).toBe(true)
    expect(result.presets.presets.find((preset) => preset.customMemoryId === 'claude:praca')?.command).toContain('CLAUDE_CONFIG_DIR=')
    expect(result.presets.presets.find((preset) => preset.customMemoryId === 'codex:personal')?.command).toContain('CODEX_HOME=')
    expect(fs.readFileSync(path.join(home, '.zshrc'), 'utf8')).toContain('# existing shell configuration')
  })

  it('reuses discovered folders without overwriting account data or duplicating presets', () => {
    const directory = path.join(home, '.codex-work')
    fs.mkdirSync(directory)
    fs.writeFileSync(path.join(directory, 'config.toml'), '# user configuration')
    expect(listCustomMemoryPresets()[0]).toMatchObject({ id: 'codex:work', terminalPresetExists: false })
    addCustomMemoryTerminalPreset('codex:work')
    const replay = addCustomMemoryTerminalPreset('codex:work')
    expect(replay.presets.presets.filter((preset) => preset.customMemoryId === 'codex:work')).toHaveLength(1)
    expect(fs.readFileSync(path.join(directory, 'config.toml'), 'utf8')).toBe('# user configuration')
    expect(() => createCustomMemoryPreset('codex', 'Work')).toThrow('already exists')
  })

  it('uses the same safe, normalized suffix for preview and persisted directory', () => {
    expect(customMemoryName('  Práca / tím 2  ')).toBe('praca-tim-2')
    expect(customMemoryName('../')).toBe('')
    expect(() => createCustomMemoryPreset('claude', '../')).toThrow('valid name')
    expect(fs.readdirSync(home)).toEqual(['.zshrc'])
  })

  it('uses an existing folder outside home as-is and creates a missing one', () => {
    const desktop = path.join(home, 'Desktop')
    const existing = path.join(desktop, 'old-claude')
    fs.mkdirSync(existing, { recursive: true })
    fs.writeFileSync(path.join(existing, '.claude.json'), '{"keep":true}')

    const result = createCustomMemoryPreset('claude', 'Old', existing)
    const item = result.memories.find((memory) => memory.id === 'claude:old')
    expect(item).toMatchObject({ location: 'custom', directoryPath: existing, displayPath: existing, aliasExists: true, terminalPresetExists: true })
    const command = result.presets.presets.find((preset) => preset.customMemoryId === 'claude:old')?.command
    if (process.platform === 'win32') {
      expect(command).toBe(`set "CLAUDE_CONFIG_DIR=${existing}" && claude --dangerously-skip-permissions`)
      expect(item?.aliasCommand).toBe(`function claude-old { $env:CLAUDE_CONFIG_DIR="${existing}"; claude @args }`)
    } else {
      expect(command).toBe('CLAUDE_CONFIG_DIR="$HOME/Desktop/old-claude" claude --dangerously-skip-permissions')
      expect(fs.readFileSync(path.join(home, '.zshrc'), 'utf8')).toContain(`alias claude-old='CLAUDE_CONFIG_DIR="$HOME/Desktop/old-claude" claude'`)
    }
    expect(fs.readFileSync(path.join(existing, '.claude.json'), 'utf8')).toBe('{"keep":true}')

    createCustomMemoryPreset('codex', 'Fresh', '~/Desktop/codex-fresh')
    expect(fs.statSync(path.join(desktop, 'codex-fresh')).isDirectory()).toBe(true)
    expect(() => createCustomMemoryPreset('codex', 'Again', path.join(desktop, 'codex-fresh'))).toThrow('already')
    expect(() => createCustomMemoryPreset('codex', 'Deep', path.join(desktop, 'missing', 'x'))).toThrow('does not exist')
    expect(() => createCustomMemoryPreset('codex', 'Rel', 'relative/dir')).toThrow('absolute')

    const remaining = removeCustomMemoryPreset('claude:old')
    expect(remaining.map((memory) => memory.id)).toEqual(['codex:fresh'])
    expect(fs.existsSync(existing)).toBe(true)
  })
})
