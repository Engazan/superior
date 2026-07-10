import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'ghost' | 'danger-ghost'
type Size = 'sm' | 'md'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Accessible name; also the tooltip unless `title` overrides it. */
  label: string
  variant?: Variant
  size?: Size
}

const VARIANT: Record<Variant, string> = {
  ghost: 'text-fgmuted hover:bg-hover hover:text-fg',
  'danger-ghost': 'text-fgmuted hover:bg-dangerBg hover:text-danger'
}

const SIZE: Record<Size, string> = {
  sm: 'h-6 w-6',
  md: 'h-7 w-7'
}

/**
 * A square icon-only button. `label` is mandatory so every icon button is
 * accessible and tooltipped (the global TooltipLayer reads `title`).
 */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, title, variant = 'ghost', size = 'md', className = '', children, ...rest },
  ref
): React.JSX.Element {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={title ?? label}
      className={`grid shrink-0 place-items-center rounded-md transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
})
