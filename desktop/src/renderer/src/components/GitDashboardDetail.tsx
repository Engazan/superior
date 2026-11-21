import { useCallback, useEffect, useRef, type RefObject } from 'react'
import ReactMarkdown from 'react-markdown'
import type {
  DashboardError, DashboardItem, DashboardKind, DashboardProject, DashboardReviewState
} from '@shared/git-dashboard'
import { DASHBOARD_REFRESH_MS, useDashboardData } from '../hooks/useDashboardData'
import { useI18n } from '../i18n'
import { BranchIcon, CheckIcon, ChevronIcon, ExternalLinkIcon, HistoryIcon, useToast } from './ui'

type Status = DashboardItem['state'] | 'draft'
type CheckStatus = 'passed' | 'failed' | 'running'
const LABEL_COLORS = new Map([
  ['bug', 'var(--c-danger)'], ['feature', 'var(--c-accent)'], ['ui', 'var(--dashboard-merged)'],
  ['perf', 'var(--c-status)'], ['docs', 'var(--c-warn)']
])

function changesUrl(url: string, provider: DashboardProject['provider']): string {
  const changes = new URL(url)
  changes.pathname = `${changes.pathname.replace(/\/+$/, '')}/${provider === 'gitlab' ? 'diffs' : 'files'}`
  changes.hash = ''
  return changes.href
}

export const itemRef = (item: DashboardItem): string => `${item.kind === 'issue' ? '#' : '!'}${item.id}`
export const statusClass = (item: DashboardItem): Status => item.state === 'open' && item.draft ? 'draft' : item.state

export function ItemIcon({ kind, status, size = 16 }: { kind: DashboardKind; status?: Status; size?: number }) {
  return <svg className={status ? `ic c-${status}` : 'ic'} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'issue' ? <>
      <circle cx="12" cy="12" r="8.5" />
      {status === 'closed' || status === 'merged' ? <path d="m8.5 12 2.2 2.2 4.8-4.8" /> : <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />}
    </> : <>
      <circle cx="6" cy="5" r="2" /><path d="M6 7v10" /><circle cx="6" cy="19" r="2" />
      {status === 'merged'
        ? <path d="M18 5v3a6 6 0 0 1-6 6H6m9-6 3-3 3 3" />
        : status === 'closed'
          ? <path d="m15 4 5 5m0-5-5 5" />
          : <path d="M18 17v-5a6 6 0 0 0-6-6m3-3-3 3 3 3" />}
      {status !== 'merged' && status !== 'closed' && <circle cx="18" cy="19" r="2" />}
    </>}
  </svg>
}

export function Avatar({ person, large }: { person: string; large?: boolean }) {
  const initials = person.match(/[\p{L}\p{N}]+/gu)?.slice(0, 2).map((part) => part[0]).join('') || person.slice(0, 1)
  const hue = [...person].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5
  return <span className={`av av-${hue} ${large ? 'lg' : ''}`} title={person}>{initials.toUpperCase()}</span>
}

export function Labels({ labels }: { labels: DashboardItem['labels'] }) {
  return labels?.map(({ name, color }) =>
    <span className="label" key={name}><i style={{ backgroundColor: color ?? LABEL_COLORS.get(name.toLowerCase()) }} />{name}</span>)
}

export function CheckStatusIcon({ status }: { status: CheckStatus }) {
  return <svg className={`pipeline-${status}`} width="14" height="14" viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="8" r="6" strokeDasharray={status === 'running' ? '2 2' : undefined} />
    {status === 'passed' && <path d="m5.5 8 1.7 1.7 3.3-3.4" />}
    {status === 'failed' && <path d="m6 6 4 4m0-4-4 4" />}
    {status === 'running' && <path d="M8 5v3l2 1" />}
  </svg>
}

export function RelativeTime({ value, now }: { value: string | number; now: number }) {
  const { lang } = useI18n()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const minutes = Math.round((date.getTime() - now) / 60_000)
  const magnitude = Math.abs(minutes)
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const relative = magnitude < 60 ? format.format(minutes, 'minute')
    : magnitude < 1440 ? format.format(Math.round(minutes / 60), 'hour')
      : magnitude < 43200 ? format.format(Math.round(minutes / 1440), 'day')
        : Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(date)
  return <time dateTime={date.toISOString()} title={date.toLocaleString(lang)}>{relative}</time>
}

export function DashboardNotice({ error, stale, onRetry }: { error: DashboardError; stale: boolean; onRetry: () => void }) {
  const { t } = useI18n()
  return <div className={`notice ${stale ? 'warn' : 'danger'}`} role="status">
    <p>{t(`dashboard.error.${error}`)} {stale && t('dashboard.stale')}</p>
    <button type="button" onClick={onRetry}>{t('common.retry')}</button>
  </div>
}

function People({ names }: { names: string[] }) {
  return names.length ? names.map((name) => (
    <span className="person" key={name}><Avatar person={name} large />{name}</span>
  )) : '—'
}

export function ItemDetail({ folder, project, provider, item, review, onClose, copyRef, now, sheetOpen }: {
  folder: string
  project: DashboardProject
  provider: string
  item: DashboardItem
  now: number
  review?: DashboardReviewState
  sheetOpen: boolean
  onClose: () => void
  copyRef: RefObject<HTMLButtonElement | null>
}) {
  const { t } = useI18n()
  const toast = useToast()
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const back = close.current
    if (sheetOpen && back?.offsetParent && !document.activeElement?.closest('.git-dashboard .detail')) back.focus()
  }, [sheetOpen])
  const { id, kind } = item
  const { integrationId, fullName } = project
  const request = useCallback(() => window.api.dashboardDetail(folder, { integrationId, fullName }, kind, id),
    [folder, integrationId, fullName, kind, id])
  const detail = useDashboardData(`${kind}:${id}`, request, DASHBOARD_REFRESH_MS)
  const data = detail.data
  const current = data ? { ...item, ...data, pipeline: data.pipeline ?? item.pipeline,
    conflicts: data.conflicts ?? item.conflicts, labels: data.labels ?? item.labels } : item
  const status = statusClass(current)
  const url = current.url
  const isMerge = kind === 'merge-request'
  const isBlocked = current.pipeline === 'failed' || current.conflicts
  const approvals = data?.approvals
  const awaitingApproval = !!approvals?.remaining
  const isReady = current.mergeReady && !isBlocked && !current.draft && !awaitingApproval
  const showChecks = isMerge && current.state === 'open' &&
    (current.pipeline !== undefined || current.conflicts !== undefined || review === 'pending' || current.draft || approvals || isReady)
  const checking = awaitingApproval || review === 'pending' || current.pipeline === 'running'
  const headline = isBlocked ? t('dashboard.mergeBlocked') : current.draft ? t('dashboard.draft')
    : awaitingApproval ? t('dashboard.approvalsRemaining', { count: approvals.remaining })
      : isReady ? t('dashboard.mergeReady') : review === 'pending' ? t('dashboard.waiting') : t('dashboard.mergeChecks')
  const copyUrl = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('dashboard.copied'))
    } catch {
      toast.error(t('dashboard.copyFailed'))
    }
  }

  return <>
    <div className="d-head">
      <div className="d-top">
        <button ref={close} type="button" className="icon-btn back" aria-label={t('dashboard.back')} onClick={onClose}>
          <ChevronIcon direction="left" size={17} />
        </button>
        <span className={`pill ${status}`}><ItemIcon kind={kind} status={status} size={14} />
          {status === 'draft' ? t('dashboard.draft') : t(`dashboard.state.${status}`)}
        </span>
        <span className="mono">{itemRef(current)}</span>
        {current.updatedAt && <span>· <RelativeTime value={current.updatedAt} now={now} /></span>}
      </div>
      <h2>{current.title}</h2>
      {current.sourceBranch && <div className="branch">
        <BranchIcon size={14} /><code>{current.sourceBranch}</code>
        {data?.targetBranch && <>→ <code>{data.targetBranch}</code></>}
        {(data?.additions !== undefined || data?.deletions !== undefined) && <span className="diffstat">
          {data.additions !== undefined && <span className="a">+{data.additions}</span>}{' '}
          {data.deletions !== undefined && <span className="d">−{data.deletions}</span>}
        </span>}
      </div>}
    </div>
    <div className="actions">
      {review === 'pending' && <a className="btn primary" href={changesUrl(url, project.provider)} target="_blank" rel="noreferrer">
        <CheckIcon size={14} />{t('dashboard.openReview')}
      </a>}
      <span className="grow" />
      <button ref={copyRef} type="button" className="btn" onClick={() => void copyUrl()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="8" y="8" width="11" height="12" rx="2" /><path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>{t('dashboard.copyUrl')}
      </button>
      <a className="btn" href={url} target="_blank" rel="noreferrer"><ExternalLinkIcon size={14} />{provider}</a>
    </div>
    <div className="d-body">
      {detail.error && <DashboardNotice error={detail.error} stale={!!data} onRetry={detail.refresh} />}
      {showChecks && <section>
        <h3>{t('dashboard.readiness')}</h3>
        <div className="ready">
          <div className={`ready-head ${isBlocked ? 'block' : isReady ? 'ok' : checking ? 'wait' : 'neutral'}`}>
            <BranchIcon size={15} />{headline}
          </div>
          <ul>
            {current.pipeline && <li><CheckStatusIcon status={current.pipeline} /><span>{t('dashboard.pipeline')}</span>
              <span className="check-value">{t(`dashboard.pipeline.${current.pipeline}`)}</span></li>}
            {approvals && <li><CheckStatusIcon status={awaitingApproval ? 'running' : 'passed'} /><span>{t('dashboard.approvals')}</span>
              <span className="check-value">{approvals.required - approvals.remaining} / {approvals.required}</span></li>}
            {current.conflicts !== undefined && <li><CheckStatusIcon status={current.conflicts ? 'failed' : 'passed'} /><span>{t('dashboard.conflicts')}</span>
              <span className="check-value">{t(current.conflicts ? 'dashboard.conflicts.present' : 'dashboard.conflicts.none')}</span></li>}
            {review === 'pending' && !approvals && <li><CheckStatusIcon status="running" /><span>{t('dashboard.reviews')}</span>
              <span className="check-value">{t('dashboard.waiting')}</span></li>}
          </ul>
        </div>
      </section>}
      <dl className="meta">
        <dt>{t('dashboard.author')}</dt><dd><People names={current.author ? [current.author] : []} /></dd>
        <dt>{t('dashboard.assignees')}</dt><dd><People names={current.assignees} /></dd>
        {data?.reviewers && <><dt>{t('dashboard.reviewers')}</dt><dd><People names={data.reviewers} /></dd></>}
        {!!current.labels?.length && <><dt>{t('dashboard.labels')}</dt><dd><Labels labels={current.labels} /></dd></>}
        <dt>{t('dashboard.link')}</dt><dd className="url-row"><a href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, '')}</a></dd>
      </dl>
      {detail.loading && <div role="status" aria-label={t('common.loading')}><span className="sk" /></div>}
      {data && <section>
        <h3>{t('dashboard.description')}</h3>
        <div className="desc">
          <ReactMarkdown disallowedElements={['img']} components={{
            a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>
          }}>{data.body || t('dashboard.noDescription')}</ReactMarkdown>
        </div>
      </section>}
      {(current.updatedAt || data?.createdAt) && <section>
        <h3>{t('dashboard.activity')}</h3>
        <ul className="tl">
          {data?.createdAt && <li><span className="node">{current.author ? <Avatar person={current.author} large /> : <HistoryIcon />}</span>
            <span>{current.author && <strong>{current.author} </strong>}{t('dashboard.created')} <span className="when">· <RelativeTime value={data.createdAt} now={now} /></span></span>
          </li>}
          {current.updatedAt && current.updatedAt !== data?.createdAt && <li><span className="node"><HistoryIcon size={13} /></span>
            <span>{t('dashboard.updated')} <span className="when">· <RelativeTime value={current.updatedAt} now={now} /></span></span>
          </li>}
        </ul>
      </section>}
    </div>
  </>
}
