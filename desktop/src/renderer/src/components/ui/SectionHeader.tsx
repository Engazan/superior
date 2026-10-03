import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  /** Right-aligned controls (Buttons), rendered on the title row. */
  actions?: ReactNode
  level?: 2 | 3
}

/**
 * The one settings-section header: title left, actions right, description
 * below. Replaces the per-section drift of h2 margins and header layouts.
 */
export function SectionHeader({ title, description, actions, level = 2 }: Props): React.JSX.Element {
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <header className="settings-section-header mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading className={`${level === 3 ? 'text-base' : 'text-xl'} min-w-0 font-semibold tracking-tight text-fg`}>{title}</Heading>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-fgdim">{description}</p>}
    </header>
  )
}
