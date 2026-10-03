import { useRef, useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import { Menu } from './ui/Menu'
import type { TerminalPreset } from '../types'
import type { PaneDirection } from '@shared/types'

interface Props {
  presets: TerminalPreset[]
  disabled?: boolean
  dropUp?: boolean
  onSelect: (preset: TerminalPreset) => void
  onManage: () => void
  onSplit?: (preset: TerminalPreset, direction: PaneDirection) => void
}

/** Shared picker, portaled so small terminal panes never clip its menu. */
export function PresetMenu({ presets, disabled, onSelect, onManage, onSplit }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<TerminalPreset | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const active = presets.filter((p) => p.active)
  return <>
    <button ref={ref} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open || !!chosen}
      onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }}
      className="flex h-6 w-6 items-center justify-center rounded-md text-fgdim hover:bg-hover hover:text-fg disabled:opacity-40"
      aria-label={t(onSplit ? 'pane.split' : 'terminal.addTerminal')} title={t(onSplit ? 'pane.split' : 'terminal.addTerminal')}>
      {onSplit ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" />
      </svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>}
    </button>
    {open && ref.current && <Menu anchor={ref.current} onClose={() => setOpen(false)} items={[
      ...(active.length ? active.map((preset) => ({ id: preset.id, label: preset.name,
        icon: <PresetIcon iconType={preset.iconType} icon={preset.icon} className="h-3.5 w-3.5 text-sm" />,
        onSelect: () => { if (onSplit) setChosen(preset); else onSelect(preset) }
      })) : [{ id: 'empty', label: t('launcher.noPresets'), disabled: true, onSelect: () => {} }]),
      'separator', { id: 'manage', label: t('terminal.managePresets'), onSelect: onManage }
    ]} />}
    {chosen && ref.current && <Menu anchor={ref.current} onClose={() => setChosen(null)} items={
      (['left', 'right', 'top', 'bottom'] as const).map((direction) => ({ id: direction,
        label: `${t(`pane.${direction}`)} · ${chosen.name}`, onSelect: () => onSplit?.(chosen, direction) }))
    } />}
  </>
}
