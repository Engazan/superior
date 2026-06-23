import { useUsage } from '../usageStore'
import { useI18n } from '../i18n'
import type { AgentUsage } from '../types'

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

/**
 * Live Claude subscription-usage for a session, in the terminal topbar. Shows how
 * much of the rolling 5-hour limit remains (the figure that actually runs out),
 * with cost as the fallback before the rate-limit reading is available. Renders
 * nothing until usage arrives — i.e. only for sessions running a Claude CLI.
 */
export function UsageBadge({ sessionId }: { sessionId: string }): JSX.Element | null {
  const usage = useUsage(sessionId)
  const { t } = useI18n()
  if (!usage) return null

  const hasLimit = usage.fiveHourPct !== null
  const remaining = hasLimit ? Math.max(0, Math.round(100 - (usage.fiveHourPct as number))) : 0
  const cost = usage.costUsd !== null ? formatCost(usage.costUsd) : null

  // Primary readout: remaining 5h limit when known, else cost, else tokens.
  let primary: string
  if (hasLimit) primary = `${remaining}%`
  else if (cost) primary = cost
  else primary = formatTokens(usage.totalTokens)

  // Secondary readout next to it (avoid repeating the primary).
  const secondary = hasLimit ? cost ?? formatTokens(usage.totalTokens) : null

  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded border border-edge bg-panel/50 px-1.5 py-0.5 font-mono text-[10px] text-fgmuted"
      title={tooltip(usage, t)}
    >
      {hasLimit && <Donut remaining={remaining} />}
      {hasLimit && <span className="text-fgdim">{t('usage.fiveHourShort')}</span>}
      <span>{primary}</span>
      {secondary && (
        <>
          <span className="text-fgdim">·</span>
          <span>{secondary}</span>
        </>
      )}
    </span>
  )
}
