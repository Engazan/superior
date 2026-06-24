import { ipcMain } from 'electron'
import {
  IPC,
  type AppSettings,
  type Language,
  type ShortcutMap,
  type ThemeMode,
  type UiState,
  type UsagePrimary
} from '@shared/types'
import {
  getSettings,
  setAttentionColor,
  setLanguage,
  setShortcuts,
  setTheme,
  setUi,
  setUsagePrimary,
  setUsageTracking
} from '../services/settings.service'
import { syncUsageTracking } from '../services/agent.service'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (): AppSettings => getSettings())

  ipcMain.handle(IPC.SETTINGS_SET_THEME, (_event, theme: ThemeMode): AppSettings => setTheme(theme))

  ipcMain.handle(IPC.SETTINGS_SET_LANGUAGE, (_event, language: Language): AppSettings =>
    setLanguage(language)
  )

  ipcMain.handle(IPC.SETTINGS_SET_SHORTCUTS, (_event, shortcuts: ShortcutMap): AppSettings =>
    setShortcuts(shortcuts)
  )

  ipcMain.handle(IPC.SETTINGS_SET_UI, (_event, ui: UiState): AppSettings => setUi(ui))

  ipcMain.handle(IPC.SETTINGS_SET_ATTENTION_COLOR, (_event, color: string): AppSettings =>
    setAttentionColor(color)
  )

  ipcMain.handle(
    IPC.SETTINGS_SET_USAGE_TRACKING,
    async (_event, enabled: boolean): Promise<AppSettings> => {
      const settings = setUsageTracking(enabled)
      await syncUsageTracking(settings.usageTracking)
      return settings
    }
  )

  ipcMain.handle(IPC.SETTINGS_SET_USAGE_PRIMARY, (_event, primary: UsagePrimary): AppSettings =>
    setUsagePrimary(primary)
  )
}
