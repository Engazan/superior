interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name for the group. */
  'aria-label': string
  size?: 'sm' | 'md'
  /** stretch options to equal widths (for tab-like switches) */
  fill?: boolean
}

/**
 * A one-of-N switch rendered as a segmented row. Replaces the hand-rolled
 * theme/language pickers and the launcher's Preset/Custom tabs.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  size = 'md',
  fill
}: Props<T>): JSX.Element {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-1.5 text-sm'
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`${fill ? 'flex' : 'inline-flex'} rounded-lg border border-edge bg-bar p-1`}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`${fill ? 'flex-1' : ''} rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${pad} ${
              active ? 'bg-edge text-fg shadow-sm' : 'text-fgdim hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
