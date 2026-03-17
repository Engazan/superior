interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  'aria-label'?: string
}

/** A small on/off switch. */
export function Toggle({ checked, onChange, 'aria-label': ariaLabel }: Props): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-sky-600' : 'bg-edge'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
