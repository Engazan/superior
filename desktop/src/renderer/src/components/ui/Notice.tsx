import type { ReactNode } from 'react'

type Tone = 'danger' | 'warn' | 'info' | 'success'

interface Props {
  tone?: Tone
  /** optional bold first line */
  title?: ReactNode
  /** trailing control (a retry Button, a dismiss IconButton) */
  action?: ReactNode
  className?: string
  children: ReactNode
}

const TONE: Record<Tone, string> = {
  danger: 'border-dangerBorder bg-dangerBg text-danger',
  warn: 'border-warnBorder bg-warnBg text-warn',
  info: 'border-accentBorder bg-accentBg text-accent',
  success: 'border-statusBorder bg-statusBg text-status'
}

/**
 * Inline tonal message box — the one shape for form errors, warnings and
 * info callouts (replaces the per-file dangerBorder/dangerBg divs). Danger
 * and warn announce themselves to screen readers.
 */
export function Notice({ tone = 'danger', title, action, className = '', children }: Props): React.JSX.Element {
  return (
    <div
      role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-xs leading-5 ${TONE[tone]} ${className}`}
    >
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
