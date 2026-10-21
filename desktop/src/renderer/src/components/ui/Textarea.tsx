import { forwardRef, type TextareaHTMLAttributes } from 'react'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** danger border + ring, for validation errors */
  invalid?: boolean
}

/** The canonical multi-line input, styled to match ui/Input. */
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { invalid, className = '', ...rest },
  ref
): React.JSX.Element {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`w-full resize-y rounded-md border bg-bar px-3 py-2 text-sm leading-5 text-fg placeholder:text-fgmuted transition focus-visible:outline-hidden focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        invalid
          ? 'border-dangerBorder focus-visible:ring-danger/50'
          : 'border-edge focus-visible:ring-accent/50'
      } ${className}`}
      {...rest}
    />
  )
})
