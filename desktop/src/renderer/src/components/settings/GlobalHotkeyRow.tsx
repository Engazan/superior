import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { Button, SettingRow, useToast } from '../ui'
import { eventToChord, formatChord, setRecording, useShortcuts } from '../../shortcuts'
import { ACTIONS, ChordButton } from '../KeyboardSection'

/**
 * System-wide show/hide hotkey, registered with the OS so it works while the
 * app is hidden. Recording refuses a chord an in-app shortcut already uses.
 */
export function GlobalHotkeyRow(): React.JSX.Element {
  const { t } = useI18n()
  const toast = useToast()
  const { shortcuts } = useShortcuts()
  const [recording, setRecordingState] = useState(false)
  const [globalHotkey, setGlobalHotkey] = useState<string | null>(null)

  useEffect(() => {
    void window.api.getSettings().then((s) => setGlobalHotkey(s.globalHotkey))
  }, [])

  const apply = (chord: string | null): void => {
    void window.api.setGlobalHotkey(chord).then((res) => {
      setGlobalHotkey(res.settings.globalHotkey)
      if (res.error) toast.error(res.error)
    })
  }

  useEffect(() => {
    if (!recording) return
    setRecording(true)
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingState(false)
        return
      }
      const chord = eventToChord(e)
      if (!chord) return // modifier-only press — keep waiting for the real key
      const owner = ACTIONS.find(({ id }) => shortcuts[id] === chord)
      if (owner) toast.error(t('keyboard.conflict', { chord: formatChord(chord), action: t(owner.labelKey) }))
      else apply(chord)
      setRecordingState(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      setRecording(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, shortcuts])

  return (
    <SettingRow title={t('keyboard.globalHotkey')} description={t('keyboard.globalHotkeyDesc')}>
      {globalHotkey && (
        <Button variant="ghost" size="sm" onClick={() => apply(null)}>
          {t('keyboard.globalHotkeyClear')}
        </Button>
      )}
      <ChordButton
        action={t('keyboard.globalHotkey')}
        recording={recording}
        chord={globalHotkey ? formatChord(globalHotkey) : t('keyboard.globalHotkeyUnset')}
        onClick={() => setRecordingState((value) => !value)}
      />
    </SettingRow>
  )
}
