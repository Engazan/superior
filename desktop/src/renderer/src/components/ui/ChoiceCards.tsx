import type { ReactNode } from 'react'

export interface Choice<T extends string> {
  value: T
  label: string
  description?: string
  icon?: ReactNode
}

interface Props<T extends string> {
  options: Choice<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name for the group. */
  'aria-label': string
}

/**
 * One-of-N picker for choices that need a sentence of explanation — the
 * card counterpart of SegmentedControl, with the same radiogroup keyboard
 * model (one Tab stop, arrows move the selection).
 */
export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel
}: Props<T>): React.JSX.Element {
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
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={opt.value}
            tabIndex={selected ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => onChange(opt.value)}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
              selected
                ? 'border-accent bg-accentBg/70'
                : 'border-edge bg-bar hover:border-fgmuted hover:bg-hover'
            }`}
          >
            {opt.icon && (
              <span
                className={`mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  selected ? 'bg-accent/15 text-accent' : 'bg-hover text-fgmuted'
                }`}
                aria-hidden
              >
                {opt.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{opt.label}</span>
              {opt.description && (
                <span className="mt-0.5 block text-xs leading-5 text-fgdim">{opt.description}</span>
              )}
            </span>
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                selected ? 'border-accent bg-accent' : 'border-fgmuted'
              }`}
              aria-hidden
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-panel" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
