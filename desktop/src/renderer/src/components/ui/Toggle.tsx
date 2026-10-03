interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name for the switch. */
  label?: string
  disabled?: boolean
}

/**
 * The app-wide on/off switch (merges the two previous implementations: the
 * shared h-4 sky one and SettingsView's local h-5 accent one).
 */
export function Toggle({ checked, onChange, label, disabled }: Props): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-accentSolid' : 'bg-edge'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
