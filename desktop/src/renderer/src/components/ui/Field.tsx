import type { ReactNode } from 'react'

interface Props {
  label: ReactNode
  /** id of the control the label points at */
  htmlFor?: string
  /** right-aligned content on the label row (an "Optional" tag, a switch) */
  aside?: ReactNode
  /** muted helper line under the control */
  hint?: ReactNode
  /** replaces the hint, in danger color */
  error?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Label + control + one helper line. The label reads clearly above the muted
 * hint, and a validation error takes the hint's place right under the field
 * instead of piling up at the bottom of the form.
 */
export function Field({
  label,
  htmlFor,
  aside,
  hint,
  error,
  className = '',
  children
}: Props): React.JSX.Element {
  const helper = error ?? hint
  return (
    <div className={className}>
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="text-xs font-medium text-fg2">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {helper && (
        <p
          role={error ? 'alert' : undefined}
          className={`mt-1.5 text-xs leading-5 ${error ? 'text-danger' : 'text-fgmuted'}`}
        >
          {helper}
        </p>
      )}
    </div>
  )
}

/** Small uppercase tag for the Field `aside` slot, e.g. "Optional". */
export function FieldTag({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wide text-fgmuted">{children}</span>
  )
}
