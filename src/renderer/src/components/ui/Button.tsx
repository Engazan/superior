import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** shows a spinner and disables the button */
  loading?: boolean
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accentSolid text-white hover:bg-accentSolidHover',
  secondary: 'border border-edge bg-panel text-fg2 hover:bg-hover hover:text-fg',
  ghost: 'text-fgdim hover:bg-hover hover:text-fg',
  danger: 'bg-dangerSolid text-white hover:opacity-90'
}

const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm'
}

/** The app-wide button. One fill color per variant — no per-surface drift. */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className = '', children, ...rest },
  ref
): React.JSX.Element {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  )
})
