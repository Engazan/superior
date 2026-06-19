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

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
  // cmd.exe (`/c`), which needs `set "VAR=..." && cmd` rather than inline env.
  if (isWindows) {
    return `set "${spec.envVar}=%USERPROFILE%\\${spec.prefix}${name}" && ${spec.executable} ${spec.terminalArgs}`
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

function hasTerminalPreset(state: PresetsState, spec: ProviderSpec, name: string): boolean {
  const id = memoryId(spec, name)
  const command = terminalCommand(spec, name)
  return state.presets.some((preset) => preset.customMemoryId === id || preset.command === command)
}

function discoverOne(
  spec: ProviderSpec,
  directoryName: string,
  presets: PresetsState
): CustomMemoryPreset {
  const name = profileName(spec, directoryName)
  const expectedAlias = aliasCommand(spec, name)
  const aliasFiles = shellConfigPaths()
    .filter((file) => fileContainsLine(file, expectedAlias))
    .map(configLabel)

  return {
    id: memoryId(spec, name),
    provider: spec.provider,
    name,
    directoryName,
    directoryPath: path.join(homeDir(), directoryName),
    aliasName: aliasName(spec, name),
    aliasCommand: expectedAlias,
    aliasExists: aliasFiles.length > 0,
    aliasFiles,
    terminalPresetExists: hasTerminalPreset(presets, spec, name)
  }
}

function isProviderConfigDirectory(
  spec: ProviderSpec,
  directoryName: string,
  presets: PresetsState
): boolean {
  const name = profileName(spec, directoryName)
  const directory = path.join(homeDir(), directoryName)
  if (spec.configMarkers.some((marker) => fs.existsSync(path.join(directory, marker)))) return true
  if (hasTerminalPreset(presets, spec, name)) return true
  const expectedAlias = aliasCommand(spec, name)
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
    .flatMap((entry) => {
      if (!entry.isDirectory()) return []
      let spec: ProviderSpec
      try {
        spec = specForDirectory(entry.name)
      } catch {
        return []
      }
      if (!isProviderConfigDirectory(spec, entry.name, presets)) return []
      return [discoverOne(spec, entry.name, presets)]
    })
    .sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)
    )
}

export function addCustomMemoryAlias(directoryName: string): CustomMemoryPreset[] {
  const spec = specForDirectory(directoryName)
  const directory = path.join(homeDir(), directoryName)
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Memory directory ${directoryName} does not exist.`)
  }

  const name = profileName(spec, directoryName)
  const line = aliasCommand(spec, name)
  for (const file of shellConfigPaths()) {
    if (!fileContainsLine(file, line)) appendLine(file, line)
  }
  return listCustomMemoryPresets()
}

function makeTerminalPreset(spec: ProviderSpec, name: string): TerminalPreset {
  return {
    id: randomUUID(),
    name: `${spec.label} ${name}`,
    description: `${spec.label} with isolated memory (${spec.prefix}${name})`,
    command: terminalCommand(spec, name),
    iconType: 'image',
    icon: builtinIcon(spec.provider)!.dataUrl,
    active: true,
    customMemoryId: memoryId(spec, name)
  }
}

export function addCustomMemoryTerminalPreset(
  directoryName: string
): CustomMemoryMutationResult {
  const spec = specForDirectory(directoryName)
  const directory = path.join(homeDir(), directoryName)
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Memory directory ${directoryName} does not exist.`)
  }

  const name = profileName(spec, directoryName)
  let presets = listPresets()
  if (!hasTerminalPreset(presets, spec, name)) {
    presets = savePreset(makeTerminalPreset(spec, name))
  }
  return { memories: listCustomMemoryPresets(), presets }
}

export function createCustomMemoryPreset(
  providerInput: string,
  displayName: string
): CustomMemoryMutationResult {
  const spec = providerSpec(providerInput)
  const name = slugify(displayName)
  if (!name) throw new Error('Enter a valid name.')

  const directoryName = `${spec.prefix}${name}`
  const directory = path.join(homeDir(), directoryName)
  if (fs.existsSync(directory)) throw new Error(`${directoryName} already exists.`)

  fs.mkdirSync(directory, { recursive: false })
  addCustomMemoryAlias(directoryName)
  return addCustomMemoryTerminalPreset(directoryName)
}
