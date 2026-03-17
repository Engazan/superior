import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import type { TerminalPreset } from '../types'

interface Props {
  presets: TerminalPreset[]
  disabled: boolean
  onLaunch: (preset: TerminalPreset) => void
  onOpenPresets: () => void
}

function GearIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function PresetLaunchers({ presets, disabled, onLaunch, onOpenPresets }: Props): JSX.Element {
  const { t } = useI18n()
  const active = presets.filter((p) => p.active)

  return (
    <div className="app-no-drag flex items-center gap-2">
      <button
        onClick={onOpenPresets}
        className="flex h-6 w-6 items-center justify-center rounded-md text-fgdim transition hover:bg-hover hover:text-fg"
        aria-label={t('launchers.terminalPresets')}
        title={t('launchers.terminalPresets')}
      >
        <GearIcon />
      </button>

      {active.map((p) => (
        <button
          key={p.id}
          disabled={disabled}
          onClick={() => onLaunch(p)}
          className="flex items-center gap-1.5 rounded-md bg-edge px-2.5 py-1 text-xs font-medium text-fg transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          title={disabled ? t('launchers.openWorkspaceFirst') : t('launchers.run', { command: p.command })}
        >
          <PresetIcon iconType={p.iconType} icon={p.icon} className="h-3.5 w-3.5 text-sm" />
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  )
}
