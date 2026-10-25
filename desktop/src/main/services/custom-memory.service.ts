import { app, dialog } from 'electron'
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
import { customMemoryName } from '@shared/custom-memory'
import { builtinIcon } from '@shared/icons'
import { createJsonListStore } from '../lib/jsonStore'
import {
  customAliasCommand,
  customTerminalCommand,
  parseWslPath,
  unsupportedPathReason,
  wslConfigLabel,
  wslShellConfigs
} from './custom-memory-paths'
import { listPresets, savePreset } from './presets.service'

interface ProviderSpec {
  provider: CustomMemoryProvider
  label: string
  prefix: string
  envVar: string
  executable: string
  terminalArgs: string
  configMarkers: string[]
}

const PROVIDERS: Record<CustomMemoryProvider, ProviderSpec> = {
  claude: {
    provider: 'claude',
    label: 'Claude',
    prefix: '.claude-',
    envVar: 'CLAUDE_CONFIG_DIR',
    executable: 'claude',
    terminalArgs: '--dangerously-skip-permissions',
    configMarkers: ['.claude.json']
  },
  codex: {
    provider: 'codex',
    label: 'Codex',
    prefix: '.codex-',
    envVar: 'CODEX_HOME',
    executable: 'codex',
    terminalArgs: '--dangerously-bypass-approvals-and-sandbox',
    configMarkers: ['config.toml']
  }
}

const SUPPORTED_CONFIGS = ['.zshrc', '.zprofile', '.bashrc', '.bash_profile', '.profile']

const isWindows = process.platform === 'win32'

function homeDir(): string {
  return app.isReady() ? app.getPath('home') : os.homedir()
}

function providerSpec(provider: string): ProviderSpec {
  if (provider === 'claude' || provider === 'codex') return PROVIDERS[provider]
  throw new Error('Unsupported custom memory provider.')
}

function specForDirectory(directoryName: string): ProviderSpec {
  const spec = Object.values(PROVIDERS).find((candidate) =>
    directoryName.startsWith(candidate.prefix)
  )
  if (!spec || !new RegExp(`^\\${spec.prefix}[a-z0-9][a-z0-9-]*$`).test(directoryName)) {
    throw new Error('Unsupported custom memory directory name.')
  }
  return spec
}

function profileName(spec: ProviderSpec, directoryName: string): string {
  return directoryName.slice(spec.prefix.length)
}

function memoryId(spec: ProviderSpec, name: string): string {
  return `${spec.provider}:${name}`
}

function aliasName(spec: ProviderSpec, name: string): string {
  return `${spec.executable}-${name}`
}

function aliasCommand(spec: ProviderSpec, name: string): string {
  // The alias goes into the user's own interactive shell config. POSIX shells
  // run a login shell (bash/zsh); on Windows the daemon's interactive terminal
  // is PowerShell, so emit a PowerShell function instead of a bash alias.
  if (isWindows) {
    return `function ${aliasName(spec, name)} { $env:${spec.envVar}="$HOME\\${spec.prefix}${name}"; ${spec.executable} @args }`
  }
  return `alias ${aliasName(spec, name)}='${spec.envVar}=$HOME/${spec.prefix}${name} ${spec.executable}'`
}

function terminalCommand(spec: ProviderSpec, name: string): string {
  // This command is executed by the daemon: POSIX via a login shell, Windows via
  // cmd.exe (`/c`), which needs `set VAR=...&& cmd` rather than inline env. No
  // quotes, and no space before `&&` (it would end up in the value).
  if (isWindows) {
    return `set ${spec.envVar}=%USERPROFILE%\\${spec.prefix}${name}&& ${spec.executable} ${spec.terminalArgs}`
  }
  return `${spec.envVar}="$HOME/${spec.prefix}${name}" ${spec.executable} ${spec.terminalArgs}`
}

/**
 * The "Documents" base where PowerShell keeps its profiles. OneDrive's Known
 * Folder Move silently redirects Documents, so PowerShell loads its profile from
 * `%OneDrive%\Documents` rather than `%USERPROFILE%\Documents` — honour that when
 * the OneDrive folder actually exists, else fall back to the home Documents.
 */
function documentsBase(): string {
  const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer
  if (oneDrive) {
    const redirected = path.join(oneDrive, 'Documents')
    if (fs.existsSync(redirected)) return redirected
  }
  return path.join(homeDir(), 'Documents')
}

/**
 * Profile files for both PowerShell editions that may be installed:
 * Windows PowerShell 5.1 (`WindowsPowerShell\`) and PowerShell 7+ (`PowerShell\`).
 * Writing the alias to both makes it available regardless of which one the user
 * opens, since neither edition reads the other's profile.
 */
function powershellProfilePaths(): string[] {
  const base = documentsBase()
  const file = 'Microsoft.PowerShell_profile.ps1'
  return [
    path.join(base, 'WindowsPowerShell', file), // Windows PowerShell 5.1
    path.join(base, 'PowerShell', file) // PowerShell 7+
  ]
}

function shellConfigPaths(): string[] {
  // On Windows the interactive shell is PowerShell. Prefer any profiles that
  // already exist; if none do, seed both editions' profiles so the alias works
  // whichever one the user launches.
  if (isWindows) {
    const profiles = powershellProfilePaths()
    const existing = profiles.filter((file) => fs.existsSync(file))
    return existing.length > 0 ? existing : profiles
  }

  const home = homeDir()
  const existing = SUPPORTED_CONFIGS.map((file) => path.join(home, file)).filter((file) =>
    fs.existsSync(file)
  )
  const currentShell = path.basename(process.env.SHELL || '')
  const preferred =
    currentShell.includes('bash') ? path.join(home, '.bashrc') : path.join(home, '.zshrc')
  return existing.length > 0 ? existing : [preferred]
}

/**
 * Short label for a shell-config file shown in the UI. POSIX rc files are
 * distinct by name (.bashrc, .zshrc); the two PowerShell profiles share a
 * filename, so disambiguate them by their edition folder (WindowsPowerShell vs
 * PowerShell).
 */
function configLabel(file: string): string {
  if (isWindows) return path.join(path.basename(path.dirname(file)), path.basename(file))
  return path.basename(file)
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

/**
 * A memory folder registered outside the `~/.claude-<name>` convention (any
 * absolute folder, or a WSL distro folder on Windows). Home-convention folders
 * are discovered by scanning and never stored here.
 */
interface RegisteredMemory {
  id: string
  provider: CustomMemoryProvider
  name: string
  path: string
}

const registry = createJsonListStore<RegisteredMemory>(
  'custom-memory.json',
  'directories',
  'custom memory directories'
)

/** One memory folder, wherever it lives, with everything needed to wire it up. */
interface MemoryEntry {
  spec: ProviderSpec
  name: string
  directoryPath: string
  /** Basename under the home directory for `home` entries. */
  directoryName: string
  location: CustomMemoryPreset['location']
}

function registeredEntries(): MemoryEntry[] {
  return registry.read().flatMap((item) => {
    if (item.provider !== 'claude' && item.provider !== 'codex') return []
    if (typeof item.path !== 'string' || typeof item.name !== 'string') return []
    return [{
      spec: PROVIDERS[item.provider],
      name: item.name,
      directoryPath: item.path,
      directoryName: path.basename(item.path),
      location: isWindows && parseWslPath(item.path) ? 'wsl' as const : 'custom' as const
    }]
  })
}

function homeEntry(spec: ProviderSpec, directoryName: string): MemoryEntry {
  return {
    spec,
    name: profileName(spec, directoryName),
    directoryPath: path.join(homeDir(), directoryName),
    directoryName,
    location: 'home'
  }
}

function entryTerminalCommand(entry: MemoryEntry): string {
  if (entry.location === 'home') return terminalCommand(entry.spec, entry.name)
  return customTerminalCommand(
    entry.spec,
    entry.directoryPath,
    homeDir(),
    process.platform,
    aliasName(entry.spec, entry.name)
  )
}

function entryAliasCommand(entry: MemoryEntry): string {
  if (entry.location === 'home') return aliasCommand(entry.spec, entry.name)
  return customAliasCommand(
    entry.spec,
    aliasName(entry.spec, entry.name),
    entry.directoryPath,
    homeDir(),
    process.platform
  )
}

/**
 * Shell configs the entry's alias belongs in. A WSL folder's alias goes into the
 * distro user's rc files (reached through the share), since its CLI runs there;
 * a folder outside any distro home has no such user, so it gets no alias.
 */
function entryConfigPaths(entry: MemoryEntry): string[] {
  if (entry.location !== 'wsl') return shellConfigPaths()
  const files = wslShellConfigs(entry.directoryPath, ['.bashrc', ...SUPPORTED_CONFIGS.filter((f) => f !== '.bashrc')])
  const existing = files.filter((file) => fs.existsSync(file))
  return existing.length > 0 || files.length === 0 ? existing : [files[0]]
}

function hasTerminalPreset(state: PresetsState, entry: MemoryEntry): boolean {
  const id = memoryId(entry.spec, entry.name)
  const command = entryTerminalCommand(entry)
  return state.presets.some((preset) => preset.customMemoryId === id || preset.command === command)
}

function describe(entry: MemoryEntry, presets: PresetsState): CustomMemoryPreset {
  const configs = entryConfigPaths(entry)
  const expectedAlias = configs.length > 0 ? entryAliasCommand(entry) : ''
  const aliasFiles = expectedAlias
    ? configs
        .filter((file) => fileContainsLine(file, expectedAlias))
        .map(entry.location === 'wsl' ? wslConfigLabel : configLabel)
    : []

  return {
    id: memoryId(entry.spec, entry.name),
    provider: entry.spec.provider,
    name: entry.name,
    directoryName: entry.directoryName,
    directoryPath: entry.directoryPath,
    displayPath: entry.location === 'home' ? `~/${entry.directoryName}` : entry.directoryPath,
    location: entry.location,
    aliasName: aliasName(entry.spec, entry.name),
    aliasCommand: expectedAlias,
    aliasExists: aliasFiles.length > 0,
    aliasFiles,
    terminalPresetExists: hasTerminalPreset(presets, entry)
  }
}

function isProviderConfigDirectory(entry: MemoryEntry, presets: PresetsState): boolean {
  const directory = entry.directoryPath
  if (entry.spec.configMarkers.some((marker) => fs.existsSync(path.join(directory, marker)))) return true
  if (hasTerminalPreset(presets, entry)) return true
  const expectedAlias = entryAliasCommand(entry)
  return shellConfigPaths().some((file) => fileContainsLine(file, expectedAlias))
}

function homeEntries(presets: PresetsState): MemoryEntry[] {
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(homeDir(), { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((dirent) => {
    if (!dirent.isDirectory()) return []
    let spec: ProviderSpec
    try {
      spec = specForDirectory(dirent.name)
    } catch {
      return []
    }
    const entry = homeEntry(spec, dirent.name)
    return isProviderConfigDirectory(entry, presets) ? [entry] : []
  })
}

/** Every known memory folder: discovered `~/.<provider>-*` ones plus registered ones. */
function allEntries(presets: PresetsState): MemoryEntry[] {
  const home = homeEntries(presets)
  const ids = new Set(home.map((entry) => memoryId(entry.spec, entry.name)))
  return [
    ...home,
    ...registeredEntries().filter((entry) => !ids.has(memoryId(entry.spec, entry.name)))
  ]
}

/**
 * The entry behind `provider:name`. A `~/.<provider>-<name>` folder wins (as in
 * the listing), even a freshly made one that discovery can't recognize yet.
 */
function findEntry(id: string): MemoryEntry {
  const [provider, name = ''] = id.split(':')
  const spec = providerSpec(provider)
  const directoryName = `${spec.prefix}${name}`
  specForDirectory(directoryName)
  const home = homeEntry(spec, directoryName)
  if (fs.existsSync(home.directoryPath)) return home
  return registeredEntries().find((entry) => memoryId(entry.spec, entry.name) === id) ?? home
}

function assertDirectory(entry: MemoryEntry): void {
  const directory = entry.directoryPath
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Memory directory ${directory} does not exist.`)
  }
}

export function listCustomMemoryPresets(): CustomMemoryPreset[] {
  const presets = listPresets()
  return allEntries(presets)
    .map((entry) => describe(entry, presets))
    .sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)
    )
}

export function addCustomMemoryAlias(id: string): CustomMemoryPreset[] {
  const entry = findEntry(id)
  assertDirectory(entry)
  const configs = entryConfigPaths(entry)
  if (configs.length === 0) throw new Error('No shell configuration found for this folder.')

  const line = entryAliasCommand(entry)
  for (const file of configs) {
    if (!fileContainsLine(file, line)) appendLine(file, line)
  }
  return listCustomMemoryPresets()
}

function makeTerminalPreset(entry: MemoryEntry): TerminalPreset {
  const { spec, name } = entry
  const where = entry.location === 'home' ? `${spec.prefix}${name}` : entry.directoryPath
  return {
    id: randomUUID(),
    name: `${spec.label} ${name}`,
    description: `${spec.label} with isolated memory (${where})`,
    command: entryTerminalCommand(entry),
    iconType: 'image',
    icon: builtinIcon(spec.provider)!.dataUrl,
    active: true,
    customMemoryId: memoryId(spec, name)
  }
}

export function addCustomMemoryTerminalPreset(id: string): CustomMemoryMutationResult {
  const entry = findEntry(id)
  assertDirectory(entry)

  let presets = listPresets()
  if (!hasTerminalPreset(presets, entry)) {
    presets = savePreset(makeTerminalPreset(entry))
  }
  return { memories: listCustomMemoryPresets(), presets }
}

/** Resolve a typed/picked folder to an absolute path (`~` expands to home). */
function resolveFolder(input: string): string {
  const trimmed = input.trim()
  if (isWindows && parseWslPath(trimmed)) return trimmed.replace(/\//g, '\\').replace(/\\+$/, '')
  const expanded = trimmed.replace(/^~(?=[/\\]|$)/, homeDir())
  return path.isAbsolute(expanded) ? path.resolve(expanded) : expanded
}

/**
 * Create a memory preset. Without `folder` it creates `~/.<provider>-<name>`.
 * With `folder` it uses that folder as-is when it exists (an existing profile),
 * or creates it when only its parent exists.
 */
export function createCustomMemoryPreset(
  providerInput: string,
  displayName: string,
  folder?: string
): CustomMemoryMutationResult {
  const spec = providerSpec(providerInput)
  const name = customMemoryName(displayName)
  if (!name) throw new Error('Enter a valid name.')

  if (folder === undefined) {
    const directoryName = `${spec.prefix}${name}`
    const directory = path.join(homeDir(), directoryName)
    if (fs.existsSync(directory)) throw new Error(`${directoryName} already exists.`)

    fs.mkdirSync(directory, { recursive: false })
    addCustomMemoryAlias(memoryId(spec, name))
    return addCustomMemoryTerminalPreset(memoryId(spec, name))
  }

  const directory = resolveFolder(folder)
  const reason = unsupportedPathReason(directory, process.platform)
  if (reason) throw new Error(reason)

  const id = memoryId(spec, name)
  const presets = listPresets()
  const known = allEntries(presets)
  if (known.some((entry) => memoryId(entry.spec, entry.name) === id)) {
    throw new Error(`${aliasName(spec, name)} already exists.`)
  }
  const same = (a: string, b: string): boolean =>
    isWindows ? a.toLowerCase() === b.toLowerCase() : a === b
  if (known.some((entry) => entry.spec === spec && same(entry.directoryPath, directory))) {
    throw new Error('This folder is already a custom memory preset.')
  }

  if (fs.existsSync(directory)) {
    if (!fs.statSync(directory).isDirectory()) throw new Error('The selected path is not a folder.')
  } else {
    if (!fs.existsSync(path.dirname(directory))) {
      throw new Error(`Parent folder ${path.dirname(directory)} does not exist.`)
    }
    fs.mkdirSync(directory, { recursive: false })
  }

  registry.upsert({ id, provider: spec.provider, name, path: directory })
  const entry = findEntry(id)
  if (entryConfigPaths(entry).length > 0) addCustomMemoryAlias(id)
  return addCustomMemoryTerminalPreset(id)
}

/** Forget a registered folder. The folder, its data and any terminal preset stay. */
export function removeCustomMemoryPreset(id: string): CustomMemoryPreset[] {
  registry.remove(id)
  return listCustomMemoryPresets()
}

/** Native folder picker for an existing (or newly made) memory folder. */
export async function pickCustomMemoryFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose memory folder',
    defaultPath: homeDir(),
    properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}
