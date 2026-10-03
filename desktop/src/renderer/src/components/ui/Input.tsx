import { forwardRef, type InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  /** danger border + ring, for validation errors */
  invalid?: boolean
}

/** The canonical text input. Replaces the per-file `inputCls`/`field` copies. */
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { invalid, className = '', ...rest },
  ref
): React.JSX.Element {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`h-8 w-full rounded-full border bg-bar px-3 text-sm text-fg placeholder:text-fgmuted transition focus-visible:outline-hidden focus-visible:ring-2 ${
        invalid
          ? 'border-dangerBorder focus-visible:ring-danger/50'
          : 'border-edge focus-visible:ring-accent/50'
      } ${className}`}
      {...rest}
    />
  )
})
