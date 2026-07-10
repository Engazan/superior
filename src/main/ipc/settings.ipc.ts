import { BrowserWindow, ipcMain } from 'electron'
import {
  IPC,
  type AppSettings,
  type FileOpener,
  type GlobalHotkeyResult,
  type Language,
  type ShortcutMap,
  type ThemeMode,
  type UiState,
  type UsagePrimary
} from '@shared/types'
import {
  getSettings,
  setAttentionColor,
  setFileOpener,
  setGlobalHotkey,
  setLanguage,
  setNotifications,
  setShortcuts,
  setTheme,
  setUi,
  setUsagePrimary,
  setUsageTracking
} from '../services/settings.service'
import { applyGlobalHotkey } from '../services/global-hotkey.service'
import { syncUsageTracking } from '../services/agent.service'

export function registerSettingsIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.SETTINGS_GET, (): AppSettings => getSettings())

  ipcMain.handle(IPC.SETTINGS_SET_THEME, (_event, theme: ThemeMode): AppSettings => setTheme(theme))

  ipcMain.handle(IPC.SETTINGS_SET_LANGUAGE, (_event, language: Language): AppSettings =>
    setLanguage(language)
  )

  ipcMain.handle(IPC.SETTINGS_SET_SHORTCUTS, (_event, shortcuts: ShortcutMap): AppSettings =>
    setShortcuts(shortcuts)
  )

  ipcMain.handle(IPC.SETTINGS_SET_UI, (_event, ui: Partial<UiState>): AppSettings => setUi(ui))

  ipcMain.handle(IPC.SETTINGS_SET_FILE_OPENER, (_event, opener: FileOpener): AppSettings =>
    setFileOpener(opener)
  )

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

  ipcMain.handle(IPC.SETTINGS_SET_NOTIFICATIONS, (_event, enabled: boolean): AppSettings =>
    setNotifications(enabled)
  )

  // Try to register first; only persist a chord that actually took effect.
  // The hotkey callback outlives windows — it must resolve the CURRENT window
  // through the shared getter, not a webContents captured from the request
  // (which pins a destroyed window after close + re-create and goes silent).
  ipcMain.handle(
    IPC.SETTINGS_SET_GLOBAL_HOTKEY,
    (_event, chord: string | null): GlobalHotkeyResult => {
      const error = applyGlobalHotkey(chord, getWindow)
      if (error) {
        // Fall back to the previously working registration (if any).
        applyGlobalHotkey(getSettings().globalHotkey, getWindow)
        return { settings: getSettings(), error }
      }
      return { settings: setGlobalHotkey(chord) }
    }
  )
}
