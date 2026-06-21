import { useEffect, useState } from 'react'
import { useI18n, type MessageKey } from '../i18n'
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
  { id: 'prevTerminal', labelKey: 'keyboard.prevTerminal' },
  { id: 'nextTerminal', labelKey: 'keyboard.nextTerminal' }
]

/** Rebindable keyboard shortcuts. Click a chord to record a new key combination. */
export function KeyboardSection(): JSX.Element {
  const { t } = useI18n()
  const { shortcuts, setShortcut, resetShortcut } = useShortcuts()
  const [recordingFor, setRecordingFor] = useState<ShortcutAction | null>(null)

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
      setShortcut(recordingFor, chord)
      setRecordingFor(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      setRecording(false)
    }
  }, [recordingFor, setShortcut])

  return (
    <>
      <h2 className="mb-1.5 text-lg font-semibold text-fg">{t('settings.keyboard')}</h2>
      <p className="mb-4 max-w-xl text-xs text-fgdim">{t('keyboard.desc')}</p>

      <div className="max-w-md overflow-hidden rounded-lg border border-edge">
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
                  className={`min-w-24 rounded-md border px-2.5 py-1 text-center font-mono text-xs transition ${
                    isRecording
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
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
    </>
  )
}
