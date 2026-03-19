import type {
  AppSettings,
  Language,
  ShortcutAction,
  ShortcutMap,
  ThemeMode,
  UiState
} from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

const DEFAULT_SHORTCUTS: ShortcutMap = {
  toggleSidebar: 'mod+b',
  openSettings: 'mod+,',
  maximizeFocusedCell: 'ctrl+enter',
  openLauncher: 'ctrl+§',
  toggleRightPanel: 'mod+j',
  closeFocusedCell: 'mod+w',
  closePreview: 'mod+shift+w'
}
const SHORTCUT_ACTIONS: ShortcutAction[] = [
  'toggleSidebar',
  'openSettings',
  'maximizeFocusedCell',
  'openLauncher',
  'toggleRightPanel',
  'closeFocusedCell',
  'closePreview'
]
const DEFAULT_UI: UiState = {
  sidebarCollapsed: false,
  rightSidebarOpen: false
}
const DEFAULTS: AppSettings = {
  theme: 'system',
  language: 'en',
  shortcuts: { ...DEFAULT_SHORTCUTS },
  ui: { ...DEFAULT_UI }
}
const THEMES: ThemeMode[] = ['light', 'dark', 'system']
const LANGUAGES: Language[] = ['en', 'sk', 'cs', 'pl', 'hu']

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
    ui: normalizeUi(parsed.ui)
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
