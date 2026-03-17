import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AppSettings, ThemeMode } from '@shared/types'

const DEFAULTS: AppSettings = { theme: 'system' }
const THEMES: ThemeMode[] = ['light', 'dark', 'system']

function storeFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

/** Read persisted settings, falling back to defaults for any missing/invalid field. */
export function getSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const theme = THEMES.includes(parsed.theme as ThemeMode)
      ? (parsed.theme as ThemeMode)
      : DEFAULTS.theme
    return { theme }
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
