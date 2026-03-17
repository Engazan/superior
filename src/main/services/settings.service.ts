import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AppSettings, Language, ThemeMode } from '@shared/types'

const DEFAULTS: AppSettings = { theme: 'system', language: 'en' }
const THEMES: ThemeMode[] = ['light', 'dark', 'system']
const LANGUAGES: Language[] = ['en', 'sk', 'cs', 'pl', 'hu']

function storeFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

/** Read persisted settings, falling back to defaults for any missing/invalid field. */
export function getSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      theme: THEMES.includes(parsed.theme as ThemeMode) ? (parsed.theme as ThemeMode) : DEFAULTS.theme,
      language: LANGUAGES.includes(parsed.language as Language)
        ? (parsed.language as Language)
        : DEFAULTS.language
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(settings: AppSettings): void {
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('[settings] failed to persist settings:', err)
  }
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
