import { useEffect, useState } from 'react'
import type { PullRequestState } from '@shared/pull-request'
import { requestAgentContext } from '../agentContext'
import { useI18n } from '../i18n'
import { Button, IconButton, RefreshIcon } from './ui'
export function PullRequestCard({ folderPath, branch }: { folderPath: string; branch: string | null }): React.JSX.Element {
  const { t } = useI18n()
  const [state, setState] = useState<PullRequestState | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    setState(null)
    const refresh = async (force: boolean): Promise<void> => {
      setBusy(true)
      try { const next = await window.api.getPullRequest(folderPath, force); if (active) setState(next) }
      catch (error) { if (active) setState({ fetchedAt: Date.now(), checks: [], error: String(error) }) }
      if (active) { setBusy(false); timer = setTimeout(() => void refresh(false), 60_000) }
    }
    void refresh(revision > 0)
    return () => { active = false; clearTimeout(timer) }
  }, [folderPath, branch, revision])
  const failed = state?.checks.filter(c => c.status === 'failed') ?? []
  return <section className="space-y-2 rounded-xl border border-edge bg-panel p-3.5 text-xs" aria-label="Pull request">
    <div className="flex items-center gap-2">
      {state?.number ? <>
        <span className="rounded-full bg-accentBg px-1.5 py-0.5 text-[11px] font-semibold text-accent">PR #{state.number}</span>
        <span className="text-[11px] text-fgmuted">{state.state}</span>
      </> : <span className="font-medium text-fg2">Pull request</span>}
      <IconButton className="ml-auto" size="sm" label={t('changes.refresh')} disabled={busy}
        onClick={() => setRevision(n => n + 1)}><RefreshIcon size={13} /></IconButton>
    </div>
    {state?.error ? <p className="break-words text-fgmuted">{state.error}</p> : state?.number ? <>
      <a className="block break-words text-[13px] font-semibold text-fg hover:text-accent" href={state.url} target="_blank" rel="noreferrer">{state.title}</a>
      {state.head !== state.localHead && <p className="text-warn">{t('pr.otherHead')}</p>}
      <ul className="max-h-28 space-y-1.5 overflow-auto">
        {state.checks.map((check, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2 text-fg2">
            <span aria-hidden className={check.status === 'passed' ? 'text-status' : check.status === 'pending' ? 'text-warn' : check.status === 'failed' ? 'text-danger' : 'text-fgmuted'}>
              {check.status === 'passed' ? '✓' : check.status === 'failed' ? '×' : '○'}
            </span>
            <span className="min-w-0 flex-1 truncate">{check.url ? <a href={check.url} target="_blank" rel="noreferrer">{check.name}</a> : check.name}</span>
            <span className="text-fgmuted">{check.status}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-fg2"><span aria-hidden>○</span>{state.review || t('pr.awaitingReview')}</li>
      </ul>
      {!state.checks.length && <p className="text-fgmuted">{t('pr.noChecks')}</p>}
      {!!failed.length && <Button size="xs" variant="secondary" onClick={() => requestAgentContext({ source: state.url!,
        text: `PR #${state.number}: ${state.title}\nBranch: ${state.branch}\nPR commit: ${state.head}\nLocal commit: ${state.localHead}\nFailed checks:\n${failed.map(c => `${c.name}: ${c.url}`).join('\n')}` })}>{t('context.send')}</Button>}
    </> : <p className="text-fgmuted">{t('changes.loading')}</p>}
  </section>
}
