import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type {
  CustomMemoryMutationResult,
  CustomMemoryPreset,
  CustomMemoryProvider,
  PresetsState,
  TerminalPreset
} from '@shared/types'
import { builtinIcon } from '@shared/icons'
import { listPresets, savePreset } from './presets.service'

const CLAUDE_PREFIX = '.claude-'
const SUPPORTED_CONFIGS = ['.zshrc', '.zprofile', '.bashrc', '.bash_profile', '.profile']

function homeDir(): string {
  return app.isReady() ? app.getPath('home') : os.homedir()
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function assertProvider(provider: string): asserts provider is CustomMemoryProvider {
  if (provider !== 'claude') throw new Error('Only Claude custom memory is supported.')
}

function assertSafeDirectoryName(directoryName: string): void {
  if (!/^\.claude-[a-z0-9][a-z0-9-]*$/.test(directoryName)) {
    throw new Error('Unsupported Claude memory directory name.')
  }
}

function memoryId(name: string): string {
  return `claude:${name}`
}

function aliasName(name: string): string {
  return `claude-${name}`
}

function aliasCommand(name: string): string {
  return `alias ${aliasName(name)}='CLAUDE_CONFIG_DIR=$HOME/.claude-${name} claude'`
}

function terminalCommand(name: string): string {
  return `CLAUDE_CONFIG_DIR="$HOME/.claude-${name}" claude --dangerously-skip-permissions`
}

function shellConfigPaths(): string[] {
  const home = homeDir()
  const existing = SUPPORTED_CONFIGS.map((file) => path.join(home, file)).filter((file) =>
    fs.existsSync(file)
  )
  const currentShell = path.basename(process.env.SHELL || '')
  const preferred =
    currentShell.includes('bash') ? path.join(home, '.bashrc') : path.join(home, '.zshrc')
  return existing.length > 0 ? existing : [preferred]
}

function fileContainsLine(file: string, line: string): boolean {
  try {
    return fs
      .readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .some((candidate) => candidate.trim() === line)
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

function hasTerminalPreset(state: PresetsState, name: string): boolean {
  const id = memoryId(name)
  const command = terminalCommand(name)
  return state.presets.some((preset) => preset.customMemoryId === id || preset.command === command)
}

function discoverOne(directoryName: string, presets: PresetsState): CustomMemoryPreset {
  const name = directoryName.slice(CLAUDE_PREFIX.length)
  const expectedAlias = aliasCommand(name)
  const aliasFiles = shellConfigPaths()
    .filter((file) => fileContainsLine(file, expectedAlias))
    .map((file) => path.basename(file))

  return {
    id: memoryId(name),
    provider: 'claude',
    name,
    directoryName,
    directoryPath: path.join(homeDir(), directoryName),
    aliasName: aliasName(name),
    aliasCommand: expectedAlias,
    aliasExists: aliasFiles.length > 0,
    aliasFiles,
    terminalPresetExists: hasTerminalPreset(presets, name)
  }
}

function isClaudeConfigDirectory(directoryName: string, presets: PresetsState): boolean {
  const name = directoryName.slice(CLAUDE_PREFIX.length)
  const directory = path.join(homeDir(), directoryName)
  if (fs.existsSync(path.join(directory, '.claude.json'))) return true
  if (hasTerminalPreset(presets, name)) return true
  const expectedAlias = aliasCommand(name)
  return shellConfigPaths().some((file) => fileContainsLine(file, expectedAlias))
}

export function listCustomMemoryPresets(): CustomMemoryPreset[] {
  const home = homeDir()
  const presets = listPresets()
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(home, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith(CLAUDE_PREFIX) &&
        /^\.claude-[a-z0-9][a-z0-9-]*$/.test(entry.name) &&
        isClaudeConfigDirectory(entry.name, presets)
    )
    .map((entry) => discoverOne(entry.name, presets))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function addCustomMemoryAlias(directoryName: string): CustomMemoryPreset[] {
  assertSafeDirectoryName(directoryName)
  const directory = path.join(homeDir(), directoryName)
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Memory directory ${directoryName} does not exist.`)
  }

  const name = directoryName.slice(CLAUDE_PREFIX.length)
  const line = aliasCommand(name)
  for (const file of shellConfigPaths()) {
    if (!fileContainsLine(file, line)) appendLine(file, line)
  }
  return listCustomMemoryPresets()
}

function makeTerminalPreset(name: string): TerminalPreset {
  return {
    id: randomUUID(),
    name: `Claude ${name}`,
    description: `Claude with isolated memory (${CLAUDE_PREFIX}${name})`,
    command: terminalCommand(name),
    iconType: 'image',
    icon: builtinIcon('claude')!.dataUrl,
    active: true,
    customMemoryId: memoryId(name)
  }
}

export function addCustomMemoryTerminalPreset(
  directoryName: string
): CustomMemoryMutationResult {
  assertSafeDirectoryName(directoryName)
  const directory = path.join(homeDir(), directoryName)
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Memory directory ${directoryName} does not exist.`)
  }

  const name = directoryName.slice(CLAUDE_PREFIX.length)
  let presets = listPresets()
  if (!hasTerminalPreset(presets, name)) presets = savePreset(makeTerminalPreset(name))
  return { memories: listCustomMemoryPresets(), presets }
}

export function createCustomMemoryPreset(
  providerInput: string,
  displayName: string
): CustomMemoryMutationResult {
  assertProvider(providerInput)
  const name = slugify(displayName)
  if (!name) throw new Error('Enter a valid name.')

  const directoryName = `${CLAUDE_PREFIX}${name}`
  const directory = path.join(homeDir(), directoryName)
  if (fs.existsSync(directory)) throw new Error(`${directoryName} already exists.`)

  fs.mkdirSync(directory, { recursive: false })
  addCustomMemoryAlias(directoryName)
  return addCustomMemoryTerminalPreset(directoryName)
}
