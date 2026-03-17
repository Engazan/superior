import { ipcMain } from 'electron'
import { IPC, type AppSettings, type Language, type ThemeMode } from '@shared/types'
import { getSettings, setLanguage, setTheme } from '../services/settings.service'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (): AppSettings => getSettings())

  ipcMain.handle(IPC.SETTINGS_SET_THEME, (_event, theme: ThemeMode): AppSettings => setTheme(theme))

  ipcMain.handle(IPC.SETTINGS_SET_LANGUAGE, (_event, language: Language): AppSettings =>
    setLanguage(language)
  )
}
