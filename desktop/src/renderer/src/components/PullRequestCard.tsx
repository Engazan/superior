import { useEffect, useState } from 'react'
import type { PullRequestState } from '@shared/pull-request'
import { requestAgentContext } from '../agentContext'
import { useI18n } from '../i18n'
import { Button } from './ui'
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
  return <section className="shrink-0 border-b border-edge p-2 text-xs" aria-label="Pull request">
    <div className="flex items-center justify-between gap-2"><span className="font-medium">{state?.number ? `PR #${state.number} · ${state.state}` : 'Pull request'}</span>
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => setRevision(n => n + 1)}>{t('changes.refresh')}</Button></div>
    {state?.error ? <p className="break-words text-fgmuted">{state.error}</p> : state?.number ? <>
      <a className="text-accent" href={state.url} target="_blank" rel="noreferrer">{state.title}</a>
      <p className="text-fgmuted">{state.branch} · {state.review || t('pr.awaitingReview')}</p>
      {state.head !== state.localHead && <p className="text-warn">{t('pr.otherHead')}</p>}
      <ul className="max-h-28 overflow-auto">{state.checks.map((check, i) => <li key={i} className={check.status === 'failed' ? 'text-danger' : 'text-fgdim'}>
        {check.status} · {check.url ? <a href={check.url} target="_blank" rel="noreferrer">{check.name}</a> : check.name}
      </li>)}</ul>
      {!state.checks.length && <p className="text-fgmuted">{t('pr.noChecks')}</p>}
      {!!failed.length && <Button size="xs" variant="secondary" onClick={() => requestAgentContext({ source: state.url!,
        text: `PR #${state.number}: ${state.title}\nBranch: ${state.branch}\nPR commit: ${state.head}\nLocal commit: ${state.localHead}\nFailed checks:\n${failed.map(c => `${c.name}: ${c.url}`).join('\n')}` })}>{t('context.send')}</Button>}
    </> : <p className="text-fgmuted">{t('changes.loading')}</p>}
    {state && <p className="mt-1 text-[10px] text-fgmuted">{new Date(state.fetchedAt).toLocaleTimeString()}</p>}
  </section>
}
