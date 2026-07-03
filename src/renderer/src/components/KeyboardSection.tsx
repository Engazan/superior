import { useEffect, useState } from 'react'
import { useI18n, type MessageKey } from '../i18n'
import { Button, SectionHeader, SettingRow, SettingsCard, useToast } from './ui'
import { useShortcuts, eventToChord, formatChord, setRecording } from '../shortcuts'
import type { ShortcutAction } from '../types'

const ACTIONS: { id: ShortcutAction; labelKey: MessageKey }[] = [
  { id: 'toggleSidebar', labelKey: 'keyboard.toggleSidebar' },
  { id: 'openSettings', labelKey: 'keyboard.openSettings' },
  { id: 'maximizeFocusedCell', labelKey: 'keyboard.maximizeCell' },
  { id: 'openLauncher', labelKey: 'keyboard.openLauncher' },
  { id: 'toggleRightPanel', labelKey: 'keyboard.toggleRightPanel' },
  { id: 'closeFocusedCell', labelKey: 'keyboard.closeFocusedCell' },
  { id: 'closePreview', labelKey: 'keyboard.closePreview' },
  { id: 'saveFile', labelKey: 'keyboard.saveFile' },
  { id: 'prevTerminal', labelKey: 'keyboard.prevTerminal' },
  { id: 'nextTerminal', labelKey: 'keyboard.nextTerminal' },
  { id: 'openFolder', labelKey: 'keyboard.openFolder' },
  { id: 'prevWorkspace', labelKey: 'keyboard.prevWorkspace' },
  { id: 'nextWorkspace', labelKey: 'keyboard.nextWorkspace' },
  { id: 'prevProfile', labelKey: 'keyboard.prevProfile' },
  { id: 'nextProfile', labelKey: 'keyboard.nextProfile' },
  { id: 'manageProfiles', labelKey: 'keyboard.manageProfiles' },
  { id: 'searchTerminal', labelKey: 'keyboard.searchTerminal' },
  { id: 'openPalette', labelKey: 'keyboard.openPalette' }
]

/** Rebindable keyboard shortcuts. Click a chord to record a new key combination. */
export function KeyboardSection(): JSX.Element {
  const { t } = useI18n()
  const toast = useToast()
  const { shortcuts, setShortcut, resetShortcut } = useShortcuts()
  // Which binding is being recorded: an app action, or the system-wide hotkey.
  const [recordingFor, setRecordingFor] = useState<ShortcutAction | 'global' | null>(null)
  const [globalHotkey, setGlobalHotkeyState] = useState<string | null>(null)

  useEffect(() => {
    window.api.getSettings().then((s) => setGlobalHotkeyState(s.globalHotkey))
  }, [])

  const applyGlobal = (chord: string | null): void => {
    void window.api.setGlobalHotkey(chord).then((res) => {
      setGlobalHotkeyState(res.settings.globalHotkey)
      if (res.error) toast.error(res.error)
    })
  }

  // While recording, the next key combination is captured and saved. Capture
  // phase + the module-level recording flag keep the global dispatcher quiet.
  useEffect(() => {
    if (!recordingFor) return
    setRecording(true)
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingFor(null)
        return
      }
      const chord = eventToChord(e)
      if (!chord) return // modifier-only press — keep waiting for the real key
      if (recordingFor === 'global') applyGlobal(chord)
      else setShortcut(recordingFor, chord)
      setRecordingFor(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      setRecording(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingFor, setShortcut])

  return (
    <div className="max-w-2xl">
      <SectionHeader title={t('settings.keyboard')} description={t('keyboard.desc')} />

      {/* System-wide hotkey — registered with the OS, works while the app is
          hidden. Separate from the in-app action table below. */}
      <div className="mb-4">
        <SettingsCard>
          <SettingRow title={t('keyboard.globalHotkey')} description={t('keyboard.globalHotkeyDesc')}>
            {globalHotkey && (
              <Button variant="ghost" size="sm" onClick={() => applyGlobal(null)}>
                {t('keyboard.globalHotkeyClear')}
              </Button>
            )}
            <button
              onClick={() => setRecordingFor(recordingFor === 'global' ? null : 'global')}
              className={`min-w-24 rounded-md border px-2.5 py-1 text-center font-mono text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                recordingFor === 'global'
                  ? 'border-statusBorder bg-statusBg text-status'
                  : 'border-edge text-fg hover:bg-hover'
              }`}
            >
              {recordingFor === 'global'
                ? t('keyboard.recording')
                : globalHotkey
                  ? formatChord(globalHotkey)
                  : t('keyboard.globalHotkeyUnset')}
            </button>
          </SettingRow>
        </SettingsCard>
      </div>

      <div className="overflow-hidden rounded-lg border border-edge">
        <div className="flex items-center gap-3 border-b border-edge bg-bar px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-fgmuted">
          <span className="min-w-0 flex-1">{t('keyboard.colAction')}</span>
          <span className="shrink-0">{t('keyboard.colShortcut')}</span>
        </div>
        <ul>
          {ACTIONS.map(({ id, labelKey }) => {
            const isRecording = recordingFor === id
            return (
              <li
                key={id}
                className="flex items-center gap-3 border-b border-edge px-3 py-2 text-sm last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-fg">{t(labelKey)}</span>
                <button
                  onClick={() => setRecordingFor(isRecording ? null : id)}
                  className={`min-w-24 rounded-md border px-2.5 py-1 text-center font-mono text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                    isRecording
                      ? 'border-statusBorder bg-statusBg text-status'
                      : 'border-edge text-fg hover:bg-hover'
                  }`}
                >
                  {isRecording ? t('keyboard.recording') : formatChord(shortcuts[id])}
                </button>
                <button
                  onClick={() => {
                    setRecordingFor(null)
                    resetShortcut(id)
                  }}
                  title={t('keyboard.reset')}
                  aria-label={t('keyboard.reset')}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-fgdim transition hover:bg-hover hover:text-fg"
                >
                  ↺
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
