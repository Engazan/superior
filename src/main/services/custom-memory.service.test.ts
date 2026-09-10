import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customMemoryName } from '@shared/custom-memory'

const electron = vi.hoisted(() => ({ getPath: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: electron.getPath, isReady: () => true }, dialog: {} }))
import { createCustomMemoryPreset, addCustomMemoryTerminalPreset, listCustomMemoryPresets } from './custom-memory.service'

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
    addCustomMemoryTerminalPreset('.codex-work')
    const replay = addCustomMemoryTerminalPreset('.codex-work')
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
})
