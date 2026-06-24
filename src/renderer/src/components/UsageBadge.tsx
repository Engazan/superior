import { useUsage } from '../usageStore'
import { useI18n } from '../i18n'
import { useUsagePrimary } from '../usagePrimary'
import type { AgentUsage, UsagePrimary } from '../types'

/** Compact "1.2k" / "3.4M" token formatting. */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `${n}`
}

function formatCost(usd: number): string {
  if (usd >= 100) return `$${usd.toFixed(0)}`
  if (usd >= 10) return `$${usd.toFixed(1)}`
  return `$${usd.toFixed(2)}`
}

/** Strip the vendor prefix for a tidy label, e.g. 'claude-opus-4-8' → 'opus-4-8'. */
function shortModel(model: string | null): string | null {
  if (!model) return null
  return model.replace(/^claude-/, '')
}

/** A reset timestamp (ISO or epoch) as a local HH:MM, or null if unparseable. */
function formatReset(raw: string | null): string | null {
  if (!raw) return null
  const ms = /^\d+$/.test(raw) ? Number(raw) * (raw.length <= 10 ? 1000 : 1) : Date.parse(raw)
  if (!isFinite(ms)) return null
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Green when plenty remains, red when nearly spent. */
function remainingColor(remaining: number): string {
  if (remaining <= 15) return '#f38ba8' // red
  if (remaining <= 40) return '#f9e2af' // amber
  return '#a6e3a1' // green
}

/** A small donut depleting as the limit is used up (full ring = 100% remaining). */
function Donut({ remaining }: { remaining: number }): JSX.Element {
  const r = 5
  const c = 2 * Math.PI * r
  const filled = (Math.max(0, Math.min(100, remaining)) / 100) * c
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0 -rotate-90">
      <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke={remainingColor(remaining)}
        strokeWidth="2"
        strokeDasharray={`${filled} ${c}`}
        strokeLinecap="round"
      />
    </svg>
  )
}

function tooltip(u: AgentUsage, t: ReturnType<typeof useI18n>['t']): string {
  const lines: string[] = [shortModel(u.model) ?? 'Claude']
  if (u.fiveHourPct !== null) {
    const reset = formatReset(u.resetsAt)
    const remaining = Math.max(0, Math.round(100 - u.fiveHourPct))
    lines.push(
      `${t('usage.fiveHour')}: ${t('usage.remaining')} ${remaining}% (${Math.round(
        u.fiveHourPct
      )}% ${t('usage.used')})${reset ? ` · ${t('usage.resets')} ${reset}` : ''}`
    )
  }
  if (u.sevenDayPct !== null) {
    const remaining7 = Math.max(0, Math.round(100 - u.sevenDayPct))
    lines.push(`${t('usage.sevenDay')}: ${t('usage.remaining')} ${remaining7}%`)
  }
  if (u.costUsd !== null) lines.push(`${t('usage.cost')}: ${formatCost(u.costUsd)}`)
  lines.push(
    `${t('usage.total')}: ${formatTokens(u.totalTokens)} ${t('usage.tokens')}`,
    `  ${t('usage.input')} ${formatTokens(u.inputTokens)} · ${t('usage.output')} ${formatTokens(
      u.outputTokens
    )}`,
    `  ${t('usage.cacheRead')} ${formatTokens(u.cacheReadTokens)} · ${t(
      'usage.cacheWrite'
    )} ${formatTokens(u.cacheCreationTokens)}`
  )
  const ctxPct = Math.round((u.contextTokens / u.contextLimit) * 100)
  lines.push(`${t('usage.context')}: ${ctxPct}% (${formatTokens(u.contextTokens)})`)
  return lines.join('\n')
}

interface Readout {
  /** Small dimmed label before the value, e.g. "5h"; null when self-evident. */
  label: string | null
  value: string
  /** Donut fill as % remaining, or null for figures without a ceiling. */
  donut: number | null
}

/**
 * Resolve the single figure to lead with. Falls back to remaining 5h → cost →
 * tokens whenever the chosen one isn't available yet (e.g. cost picked but the
 * rate-limit reading hasn't arrived).
 */
function primaryReadout(
  u: AgentUsage,
  mode: UsagePrimary,
  t: ReturnType<typeof useI18n>['t']
): Readout {
  const cost = u.costUsd !== null ? formatCost(u.costUsd) : null
  const fiveRemain = u.fiveHourPct !== null ? Math.max(0, Math.round(100 - u.fiveHourPct)) : null
  const sevenRemain = u.sevenDayPct !== null ? Math.max(0, Math.round(100 - u.sevenDayPct)) : null
  const ctxPct = Math.round((u.contextTokens / u.contextLimit) * 100)
  const tokens = formatTokens(u.totalTokens)

  switch (mode) {
    case 'cost':
      if (cost) return { label: null, value: cost, donut: null }
      break
    case 'sevenDay':
      if (sevenRemain !== null)
        return { label: t('usage.sevenDayShort'), value: `${sevenRemain}%`, donut: sevenRemain }
      break
    case 'tokens':
      return { label: null, value: `${tokens} ${t('usage.tokens')}`, donut: null }
    case 'context':
      return { label: t('usage.contextShort'), value: `${ctxPct}%`, donut: 100 - ctxPct }
    case 'remaining':
      break
  }
  // Default, and the fallback when the chosen figure isn't available yet.
  if (fiveRemain !== null)
    return { label: t('usage.fiveHourShort'), value: `${fiveRemain}%`, donut: fiveRemain }
  if (cost) return { label: null, value: cost, donut: null }
  return { label: null, value: `${tokens} ${t('usage.tokens')}`, donut: null }
}

/**
 * Live Claude subscription-usage for a session, in the terminal topbar. Leads
 * with the figure chosen in Settings (remaining 5h/7d limit, cost, tokens, or
 * context) and reveals the full breakdown on hover. Renders nothing until usage
 * arrives — i.e. only for sessions running a Claude CLI.
 */
export function UsageBadge({ sessionId }: { sessionId: string }): JSX.Element | null {
  const usage = useUsage(sessionId)
  const { t } = useI18n()
  const { usagePrimary } = useUsagePrimary()
  if (!usage) return null

  const { label, value, donut } = primaryReadout(usage, usagePrimary, t)

  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded border border-edge bg-panel/50 px-1.5 py-0.5 font-mono text-[10px] text-fgmuted"
      title={tooltip(usage, t)}
    >
      {donut !== null && <Donut remaining={donut} />}
      {label && <span className="text-fgdim">{label}</span>}
      <span>{value}</span>
    </span>
  )
}
