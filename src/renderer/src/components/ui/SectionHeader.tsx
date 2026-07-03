import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  /** Right-aligned controls (Buttons), rendered on the title row. */
  actions?: ReactNode
}

/**
 * The one settings-section header: title left, actions right, description
 * below. Replaces the per-section drift of h2 margins and header layouts.
 */
export function SectionHeader({ title, description, actions }: Props): JSX.Element {
  return (
    <header className="mb-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-1.5 max-w-xl text-xs text-fgdim">{description}</p>}
    </header>
  )
}
