import type {
  AppSettings,
  Language,
  ShortcutAction,
  ShortcutMap,
  ThemeMode,
  UiState,
  UsagePrimary
} from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

const DEFAULT_SHORTCUTS: ShortcutMap = {
  toggleSidebar: 'mod+b',
  openSettings: 'mod+,',
  maximizeFocusedCell: 'ctrl+enter',
  openLauncher: 'ctrl+§',
  toggleRightPanel: 'mod+j',
  closeFocusedCell: 'mod+w',
  closePreview: 'mod+shift+w',
  saveFile: 'mod+s',
  prevTerminal: 'ctrl+arrowleft',
  nextTerminal: 'ctrl+arrowright',
  openFolder: 'mod+o',
  prevWorkspace: 'mod+shift+arrowup',
  nextWorkspace: 'mod+shift+arrowdown',
  prevProfile: 'mod+shift+arrowleft',
  nextProfile: 'mod+shift+arrowright',
  manageProfiles: 'mod+shift+p'
}
const SHORTCUT_ACTIONS: ShortcutAction[] = [
  'toggleSidebar',
  'openSettings',
  'maximizeFocusedCell',
  'openLauncher',
  'toggleRightPanel',
  'closeFocusedCell',
  'closePreview',
  'saveFile',
  'prevTerminal',
  'nextTerminal',
  'openFolder',
  'prevWorkspace',
  'nextWorkspace',
  'prevProfile',
  'nextProfile',
  'manageProfiles'
]
const DEFAULT_UI: UiState = {
  sidebarCollapsed: false,
  rightSidebarOpen: false
}
/** Catppuccin peach — a warm "done" tint that reads against the dark UI. */
const DEFAULT_ATTENTION_COLOR = '#fab387'
const DEFAULTS: AppSettings = {
  theme: 'system',
  language: 'en',
  shortcuts: { ...DEFAULT_SHORTCUTS },
  ui: { ...DEFAULT_UI },
  attentionColor: DEFAULT_ATTENTION_COLOR,
  usageTracking: false,
  usagePrimary: 'remaining'
}
const THEMES: ThemeMode[] = ['light', 'dark', 'system']
const LANGUAGES: Language[] = ['en', 'sk', 'cs', 'pl', 'hu']
const USAGE_PRIMARIES: UsagePrimary[] = ['remaining', 'sevenDay', 'cost', 'tokens', 'context']

/** Merge stored shortcuts over the defaults, dropping unknown actions and non-string chords. */
function normalizeShortcuts(raw: unknown): ShortcutMap {
  const next: ShortcutMap = { ...DEFAULT_SHORTCUTS }
  if (raw && typeof raw === 'object') {
    for (const action of SHORTCUT_ACTIONS) {
      const value = (raw as Record<string, unknown>)[action]
      if (typeof value === 'string' && value.trim()) next[action] = value
    }
  }
  return next
}

/** Coerce stored UI layout flags to booleans, falling back to defaults. */
function normalizeUi(raw: unknown): UiState {
  const next: UiState = { ...DEFAULT_UI }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (typeof obj.sidebarCollapsed === 'boolean') next.sidebarCollapsed = obj.sidebarCollapsed
    if (typeof obj.rightSidebarOpen === 'boolean') next.rightSidebarOpen = obj.rightSidebarOpen
  }
  return next
}

/** Accept only a valid #rgb / #rrggbb hex color, else fall back to the default. */
function normalizeColor(raw: unknown): string {
  return typeof raw === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.trim())
    ? raw.trim().toLowerCase()
    : DEFAULT_ATTENTION_COLOR
}

function storeFile(): string {
  return userDataFile('settings.json')
}

/** Read persisted settings, falling back to defaults for any missing/invalid field. */
export function getSettings(): AppSettings {
  const parsed = readJsonFile<Partial<AppSettings>>(storeFile(), {})
  return {
    theme: THEMES.includes(parsed.theme as ThemeMode) ? (parsed.theme as ThemeMode) : DEFAULTS.theme,
    language: LANGUAGES.includes(parsed.language as Language)
      ? (parsed.language as Language)
      : DEFAULTS.language,
    shortcuts: normalizeShortcuts(parsed.shortcuts),
    ui: normalizeUi(parsed.ui),
    attentionColor: normalizeColor(parsed.attentionColor),
    usageTracking:
      typeof parsed.usageTracking === 'boolean' ? parsed.usageTracking : DEFAULTS.usageTracking,
    usagePrimary: USAGE_PRIMARIES.includes(parsed.usagePrimary as UsagePrimary)
      ? (parsed.usagePrimary as UsagePrimary)
      : DEFAULTS.usagePrimary
  }
}

function save(settings: AppSettings): void {
  writeJsonFile(storeFile(), settings, 'settings')
}

/** Persist the theme mode and return the updated settings. */
export function setTheme(theme: ThemeMode): AppSettings {
  const next: AppSettings = {
    ...getSettings(),
    theme: THEMES.includes(theme) ? theme : DEFAULTS.theme
  }
  save(next)
  return next
}

/** Persist the interface language and return the updated settings. */
export function setLanguage(language: Language): AppSettings {
  const next: AppSettings = {
    ...getSettings(),
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language
  }
  save(next)
  return next
}

/** Persist the keyboard shortcut map (merged over defaults) and return updated settings. */
export function setShortcuts(shortcuts: ShortcutMap): AppSettings {
  const next: AppSettings = {
    ...getSettings(),
    shortcuts: normalizeShortcuts(shortcuts)
  }
  save(next)
  return next
}

/** Persist the sidebar layout state and return the updated settings. */
export function setUi(ui: UiState): AppSettings {
  const next: AppSettings = {
    ...getSettings(),
    ui: normalizeUi(ui)
  }
  save(next)
  return next
}

/** Persist the workspace-attention pulse color and return the updated settings. */
export function setAttentionColor(color: string): AppSettings {
  const next: AppSettings = {
    ...getSettings(),
    attentionColor: normalizeColor(color)
  }
  save(next)
  return next
}

/** Persist whether Claude usage tracking is enabled and return the updated settings. */
export function setUsageTracking(enabled: boolean): AppSettings {
  const next: AppSettings = {
    ...getSettings(),
    usageTracking: Boolean(enabled)
  }
  save(next)
  return next
}

/** Persist which figure the usage badge leads with and return the updated settings. */
export function setUsagePrimary(primary: UsagePrimary): AppSettings {
  const next: AppSettings = {
    ...getSettings(),
    usagePrimary: USAGE_PRIMARIES.includes(primary) ? primary : DEFAULTS.usagePrimary
  }
  save(next)
  return next
}
