import type { ReactNode } from 'react'

type Tone = 'success' | 'danger' | 'warn' | 'neutral' | 'accent'

interface Props {
  tone: Tone
  /** leading status dot */
  dot?: boolean
  children: ReactNode
}

const TONE: Record<Tone, { pill: string; dot: string }> = {
  success: { pill: 'border-statusBorder bg-statusBg text-status', dot: 'bg-status' },
  danger: { pill: 'border-dangerBorder bg-dangerBg text-danger', dot: 'bg-danger' },
  warn: { pill: 'border-warnBorder bg-warnBg text-warn', dot: 'bg-warn' },
  neutral: { pill: 'border-edge bg-bar text-fgdim', dot: 'bg-fgmuted' },
  accent: { pill: 'border-accentBorder bg-accentBg text-accent', dot: 'bg-accent' }
}

/** A small tonal status chip (replaces the per-file emerald/amber/rose pills). */
export function StatusPill({ tone, dot, children }: Props): React.JSX.Element {
  const c = TONE[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${c.pill}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />}
      {children}
    </span>
  )
}
