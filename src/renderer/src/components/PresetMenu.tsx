import { useEffect, useRef, useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import type { TerminalPreset } from '../types'

interface Props {
  presets: TerminalPreset[]
  /** when true the trigger is non-interactive (e.g. grid already full) */
  disabled?: boolean
  /** open the menu upward (for a bottom-anchored trigger) */
  dropUp?: boolean
  onSelect: (preset: TerminalPreset) => void
  onManage: () => void
}

/** A "+" trigger that opens a dropdown of active presets plus a "Manage presets…" item. */
export function PresetMenu({ presets, disabled, dropUp, onSelect, onManage }: Props): JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = presets.filter((p) => p.active)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-6 items-center justify-center rounded-md text-fgdim transition hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t('terminal.addTerminal')}
        title={t('terminal.addTerminal')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute right-0 z-50 min-w-44 overflow-hidden rounded-md border border-edge bg-panel py-1 shadow-lg ${
            dropUp ? 'bottom-8' : 'top-7'
          }`}
        >
          {active.length === 0 && (
            <div className="px-3 py-2 text-xs text-fgmuted">{t('launcher.noPresets')}</div>
          )}
          {active.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false)
                onSelect(p)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg transition hover:bg-hover"
            >
              <PresetIcon iconType={p.iconType} icon={p.icon} className="h-3.5 w-3.5 text-sm" />
              <span>{p.name}</span>
            </button>
          ))}
          <div className="my-1 border-t border-edge" />
          <button
            onClick={() => {
              setOpen(false)
              onManage()
            }}
            className="flex w-full items-center px-3 py-1.5 text-left text-xs text-fgdim transition hover:bg-hover hover:text-fg"
          >
            {t('terminal.managePresets')}
          </button>
        </div>
      )}
    </div>
  )
}
