export interface PullRequestCheck {
  name: string
  status: 'passed' | 'failed' | 'pending' | 'skipped' | 'unknown'
  url: string
}
export interface PullRequestState {
  fetchedAt: number
  branch?: string
  localHead?: string
  number?: number
  title?: string
  url?: string
  state?: string
  review?: string
  head?: string
  checks: PullRequestCheck[]
  error?: string
}
export function parseChecks(value: unknown): PullRequestCheck[] {
  if (!Array.isArray(value)) return []
  return value.filter(v => v && typeof v === 'object').map(v => {
    const result = String(v.conclusion || v.state || v.status || '').toUpperCase()
    const status = ['SUCCESS', 'SUCCESSFUL'].includes(result) ? 'passed'
      : ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'].includes(result) ? 'failed'
      : ['NEUTRAL', 'SKIPPED'].includes(result) ? 'skipped'
      : ['PENDING', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED', 'EXPECTED'].includes(result) ? 'pending' : 'unknown'
    const url = String(v.detailsUrl || v.targetUrl || '')
    return { name: String(v.name || v.context || 'Check'), status, url: /^https:\/\//.test(url) ? url : '' }
  })
}
