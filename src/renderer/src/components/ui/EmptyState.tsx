import type { ReactNode } from 'react'

interface Props {
  icon?: ReactNode
  title: string
  description?: string
  /** optional call-to-action rendered under the text */
  action?: ReactNode
}

/** Centered dashed-border card for empty lists. */
export function EmptyState({ icon, title, description, action }: Props): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-edge px-4 py-8 text-center">
      {icon && <span className="text-fgmuted">{icon}</span>}
      <div className="text-sm text-fgdim">{title}</div>
      {description && <p className="max-w-xs text-xs text-fgmuted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
