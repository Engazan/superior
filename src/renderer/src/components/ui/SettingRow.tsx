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
 * truncates first when space runs out; the control never shrinks.
 */
export function SettingRow({ title, description, children }: RowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description && <p className="mt-0.5 max-w-sm text-xs text-fgdim">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}
