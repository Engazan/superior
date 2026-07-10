import { BrowserWindow } from 'electron'
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
import { handle } from './handle'

export function registerSettingsIpc(getWindow: () => BrowserWindow | null): void {
  handle(IPC.SETTINGS_GET, (): AppSettings => getSettings())

  handle(IPC.SETTINGS_SET_THEME, (theme: ThemeMode): AppSettings => setTheme(theme))

  handle(IPC.SETTINGS_SET_LANGUAGE, (language: Language): AppSettings =>
    setLanguage(language)
  )

  handle(IPC.SETTINGS_SET_SHORTCUTS, (shortcuts: ShortcutMap): AppSettings =>
    setShortcuts(shortcuts)
  )

  handle(IPC.SETTINGS_SET_UI, (ui: Partial<UiState>): AppSettings => setUi(ui))

  handle(IPC.SETTINGS_SET_FILE_OPENER, (opener: FileOpener): AppSettings =>
    setFileOpener(opener)
  )

  handle(IPC.SETTINGS_SET_ATTENTION_COLOR, (color: string): AppSettings =>
    setAttentionColor(color)
  )

  handle(
    IPC.SETTINGS_SET_USAGE_TRACKING,
    async (enabled: boolean): Promise<AppSettings> => {
      const settings = setUsageTracking(enabled)
      await syncUsageTracking(settings.usageTracking)
      return settings
    }
  )

  handle(IPC.SETTINGS_SET_USAGE_PRIMARY, (primary: UsagePrimary): AppSettings =>
    setUsagePrimary(primary)
  )

  handle(IPC.SETTINGS_SET_NOTIFICATIONS, (enabled: boolean): AppSettings =>
    setNotifications(enabled)
  )

  // Try to register first; only persist a chord that actually took effect.
  // The hotkey callback outlives windows — it must resolve the CURRENT window
  // through the shared getter, not a webContents captured from the request
  // (which pins a destroyed window after close + re-create and goes silent).
  handle(
    IPC.SETTINGS_SET_GLOBAL_HOTKEY,
    (chord: string | null): GlobalHotkeyResult => {
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
