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
  /** allow options to wrap onto multiple lines (long localized labels) */
  wrap?: boolean
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
  fill,
  wrap
}: Props<T>): JSX.Element {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-1.5 text-sm'

  // Proper radiogroup keyboard model: one Tab stop (the checked option),
  // Arrow keys move — and select — the previous/next option.
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const backward = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
    if (!backward && !forward) return
    e.preventDefault()
    const idx = options.findIndex((o) => o.value === value)
    const next = options[(idx + (forward ? 1 : -1) + options.length) % options.length]
    onChange(next.value)
    const parent = e.currentTarget.parentElement
    ;(parent?.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`${fill ? 'flex' : 'inline-flex'} ${wrap ? 'flex-wrap justify-end gap-y-1' : ''} rounded-lg border border-edge bg-bar p-1`}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            data-value={opt.value}
            tabIndex={active ? 0 : -1}
            onKeyDown={onKeyDown}
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
