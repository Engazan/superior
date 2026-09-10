import type { ReactNode } from 'react'

/** Bordered card that stacks {@link SettingRow}s with automatic dividers. */
export function SettingsCard({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="settings-island divide-y divide-edge">{children}</div>
}

interface RowProps {
  title: string
  description?: string
  /** the control(s), right-aligned */
  children: ReactNode
}

/**
 * One setting inside a {@link SettingsCard}: name + description on the left,
 * control on the right (macOS/VS Code settings style). The left column
 * and controls stack when their settings container gets narrow.
 */
export function SettingRow({ title, description, children }: RowProps): React.JSX.Element {
  return (
    <div className="settings-row flex items-center justify-between gap-6 px-4 py-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description && <p className="mt-1 max-w-md text-xs leading-relaxed text-fgdim [overflow-wrap:anywhere]">{description}</p>}
      </div>
      <div className="settings-row-controls flex max-w-full shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
