import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'

/** Short, quiet two-note chime. Autoplay restrictions must never break the UI. */
function chime(): () => void {
  let context: AudioContext | undefined
  try {
    context = new AudioContext()
    const audio = context
    void audio.resume().then(() => {
      if (audio.state !== 'running') return
      for (const [index, frequency] of [660, 880].entries()) {
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        const start = audio.currentTime + index * 0.16
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.045, start + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
        oscillator.connect(gain); gain.connect(audio.destination)
        oscillator.start(start); oscillator.stop(start + 0.32)
      }
    }).catch(() => {})
  } catch { /* Audio may be unavailable; retain the visual notification. */ }
  return () => { if (context && context.state !== 'closed') void context.close().catch(() => {}) }
}

export function UsageResetNotice({ message, onClose }: { message: string; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  useEffect(() => {
    const stopSound = chime()
    const audioTimer = setTimeout(stopSound, 1500)
    const timer = setTimeout(onClose, 8000)
    return () => { clearTimeout(timer); clearTimeout(audioTimer); stopSound() }
  }, [onClose])
  return createPortal(<div className="pointer-events-none fixed inset-x-0 top-12 z-[150] flex justify-center px-4">
    <div role="status" aria-live="polite" aria-atomic="true"
      className="solid-surface flex w-full max-w-lg items-center gap-4 rounded-3xl border border-accentBorder bg-panel px-6 py-4 shadow-2xl">
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accentBg text-xl text-accent">↻</span>
      <div className="min-w-0 flex-1"><p className="text-base font-semibold text-fg">{t('footer.resetNotice')}</p>
        <p className="mt-1 break-words text-sm text-fgmuted">{message}</p></div>
      <button type="button" onClick={onClose} aria-label={t('footer.close')}
        className="pointer-events-auto rounded-full px-2 py-1 text-lg text-fgdim hover:bg-hover hover:text-fg">×</button>
    </div>
  </div>, document.body)
}
