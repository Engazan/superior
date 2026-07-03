import { forwardRef, type SelectHTMLAttributes } from 'react'

type Props = SelectHTMLAttributes<HTMLSelectElement>

/**
 * The canonical <select>, styled to match ui/Input. Keeps the native arrow
 * (no appearance-none) so no chevron overlay is needed.
 */
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { className = '', children, ...rest },
  ref
): JSX.Element {
  return (
    <select
      ref={ref}
      className={`h-8 w-full rounded-md border border-edge bg-bar px-2 text-sm text-fg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
})
