import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import { formatChord } from '../shortcuts'
import type { TerminalPreset } from '../types'

interface Props {
  /** Active presets to choose from (first 9 get a Ctrl+number shortcut). */
  presets: TerminalPreset[]
  onSelect: (preset: TerminalPreset) => void
  onClose: () => void
  /** jump to Settings → Terminal presets (empty-state CTA) */
  onManagePresets: () => void
}

/**
 * Centered overlay for adding a terminal. Presets are pickable by mouse or by
 * Ctrl+1…Ctrl+9; Escape dismisses. Rendered into <body> so it floats above the grid.
 */
export function QuickLaunch({ presets, onSelect, onClose, onManagePresets }: Props): React.JSX.Element {
  const { t } = useI18n()
  const items = presets.slice(0, 9)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      // Ctrl+1…9 launches the Nth preset (the literal Control key on every platform).
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        if (idx < items.length) {
          e.preventDefault()
          e.stopPropagation()
          onSelect(items[idx])
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items, onSelect, onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-start justify-center bg-black/40 pt-28"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('terminal.addTerminal')}
        className="solid-surface w-80 overflow-hidden rounded-lg border border-edge bg-panel shadow-xl"
      >
        <div className="border-b border-edge px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fgmuted">
          {t('terminal.addTerminal')}
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
            <span className="text-sm text-fgmuted">{t('launcher.noPresets')}</span>
            <button
              onClick={() => {
                onClose()
                onManagePresets()
              }}
              className="rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('terminal.managePresets')}
            </button>
          </div>
        ) : (
          <ul className="py-1">
            {items.map((p, i) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    onSelect(p)
                    onClose()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-hover focus-visible:bg-hover focus-visible:outline-hidden"
                >
                  <kbd className="flex h-5 shrink-0 items-center justify-center rounded-sm border border-edge bg-bar px-1.5 font-mono text-[10px] text-fgdim">
                    {formatChord(`ctrl+${i + 1}`)}
                  </kbd>
                  <PresetIcon iconType={p.iconType} icon={p.icon} className="h-4 w-4 text-base" />
                  <span className="min-w-0 truncate">{p.name}</span>
                </button>
              </li>
            ))}
            {presets.length > items.length && (
              // The picker caps at 9 (its shortcut range); say so instead of
              // silently hiding the rest.
              <li className="px-3 py-1.5 text-[11px] text-fgmuted">
                {t('launcher.morePresets', { n: presets.length - items.length })}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>,
    document.body
  )
}
