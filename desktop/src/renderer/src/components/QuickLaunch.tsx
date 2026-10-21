import { useEffect } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import { formatChord } from '../shortcuts'
import { Button } from './ui'
import { Kbd, PaletteFooter, PaletteHint, PaletteMessage, PaletteShell } from './CommandPalette'
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

  return (
    <PaletteShell label={t('terminal.addTerminal')} width="max-w-80" onClose={onClose}>
      <div className="shrink-0 border-b border-edge px-3.5 py-2.5 text-sm font-semibold text-fg">
        {t('terminal.addTerminal')}
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-3 py-6">
          <PaletteMessage className="">{t('launcher.noPresets')}</PaletteMessage>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onClose()
              onManagePresets()
            }}
          >
            {t('terminal.managePresets')}
          </Button>
        </div>
      ) : (
        <ul className="p-1.5">
          {items.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(p)
                  onClose()
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <PresetIcon iconType={p.iconType} icon={p.icon} className="h-4 w-4 text-base" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <Kbd>{formatChord(`ctrl+${i + 1}`)}</Kbd>
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
      <PaletteFooter>
        <PaletteHint keys="Esc">{t('palette.close')}</PaletteHint>
      </PaletteFooter>
    </PaletteShell>
  )
}
