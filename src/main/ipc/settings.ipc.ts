import { ipcMain } from 'electron'
import { IPC, type AppSettings, type ThemeMode } from '@shared/types'
import { getSettings, setTheme } from '../services/settings.service'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (): AppSettings => getSettings())

  ipcMain.handle(IPC.SETTINGS_SET_THEME, (_event, theme: ThemeMode): AppSettings =>
    setTheme(theme)
  )
}
