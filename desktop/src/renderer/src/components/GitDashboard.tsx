import { useCallback, useState } from 'react'
import type {
  DashboardError, DashboardFilter, DashboardItem, DashboardKind, DashboardProject
} from '@shared/git-dashboard'
import { DASHBOARD_REFRESH_MS, useDashboardData } from '../hooks/useDashboardData'
import type { useGitDashboard } from '../hooks/useGitDashboard'
import { useI18n } from '../i18n'
import { Button, IconButton, Modal, Notice, RefreshIcon, Select, useToast } from './ui'

interface Props {
  folder: string
  project: DashboardProject
  projectKey: string
  reviews: ReturnType<typeof useGitDashboard>['reviews']
}

const TABS: DashboardKind[] = ['issue', 'merge-request']

function DashboardNotice({ error, stale }: { error: DashboardError; stale: boolean }) {
  const { t } = useI18n()
  return <Notice tone={stale ? 'warn' : 'danger'}>
    {t(`dashboard.error.${error}`)} {stale && t('dashboard.stale')}
  </Notice>
}

function ItemRow({ item, onSelect, priority }: {
  item: DashboardItem
  onSelect: () => void
  priority?: boolean
}) {
  const { t } = useI18n()
  return <li>
    <button type="button" onClick={onSelect}
      className={`flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-left transition hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${priority ? 'border-warnBorder bg-warnBg/50' : 'border-transparent'}`}>
      <span className="shrink-0 font-mono text-[11px] text-fgmuted">{item.kind === 'issue' ? '#' : '!'}{item.id}</span>
      <span className="min-w-20 flex-1 break-words font-medium text-fg">{item.title}</span>
      {priority && <span className="rounded-md bg-warnBg px-2 py-0.5 text-xs font-semibold text-warn">{t('dashboard.waiting')}</span>}
      {item.state !== 'open' && <span className="text-xs text-fgmuted">{t(`dashboard.state.${item.state}`)}</span>}
    </button>
  </li>
}

function ItemDetail({ folder, project, item, onClose }: {
  folder: string
  project: DashboardProject
  item: DashboardItem
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { id, kind } = item
  const { integrationId, fullName } = project
  const request = useCallback(() => window.api.dashboardDetail(folder, { integrationId, fullName }, kind, id),
    [folder, integrationId, fullName, kind, id])
  const detail = useDashboardData(`${kind}:${id}`, request, DASHBOARD_REFRESH_MS)
  const url = detail.data?.url ?? item.url
  const copyUrl = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('dashboard.copied'))
    } catch {
      toast.error(t('dashboard.copyFailed'))
    }
  }
  const current = detail.data ?? item

  return <Modal title={current.title} size="lg" onClose={onClose}
    description={`${kind === 'issue' ? '#' : '!'}${id} · ${t(`dashboard.state.${current.state}`)}`}>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer"
          className="min-w-0 flex-1 break-all rounded-sm text-sm text-accent underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent">{url}</a>
        <Button type="button" variant="secondary" size="sm" onClick={() => void copyUrl()}>
          {t('dashboard.copyUrl')}
        </Button>
      </div>
      {current.author && <p className="text-xs text-fgmuted">{t('dashboard.author')} {current.author}</p>}
      <p className="text-xs text-fgmuted">{t('dashboard.assignees')} {current.assignees.join(', ') || '—'}</p>
      {detail.loading && <p role="status" className="text-xs text-fgmuted">{t('common.loading')}</p>}
      {detail.error && <DashboardNotice error={detail.error} stale={!!detail.data} />}
      {detail.data && <>
        {detail.data.sourceBranch && detail.data.targetBranch && (
          <p className="break-all font-mono text-xs text-fgdim">{detail.data.sourceBranch} → {detail.data.targetBranch}</p>
        )}
        <p className="max-h-[38vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-edge bg-bar p-3 text-sm">
          {detail.data.body || t('dashboard.noDescription')}
        </p>
      </>}
    </div>
  </Modal>
}

function DashboardItems({ folder, project, projectKey, reviews, kind, onSelect }: Props & {
  kind: DashboardKind
  onSelect: (item: DashboardItem) => void
}) {
  const { t } = useI18n()
  const [assignee, setAssignee] = useState<DashboardFilter['assignee']>('me')
  const [state, setState] = useState<DashboardFilter['state']>('open')
  const { integrationId, fullName } = project
  const request = useCallback(() => window.api.dashboardList(folder, { integrationId, fullName }, { kind, assignee, state }),
    [folder, integrationId, fullName, kind, assignee, state])
  const list = useDashboardData(JSON.stringify([projectKey, kind, assignee, state]), request, DASHBOARD_REFRESH_MS)
  const showReviews = kind === 'merge-request'
  const pendingIds = new Set(reviews.data?.items.filter((entry) => entry.state === 'pending').map((entry) => entry.item.id))

  return <div role="tabpanel" id={`dashboard-panel-${kind}`} aria-labelledby={`dashboard-tab-${kind}`}
    className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
    {showReviews && (
      <section aria-label={t('dashboard.reviews')} className="space-y-2 rounded-xl border border-edge bg-panel p-3">
        <h2 className="px-1 text-sm font-semibold">{t('dashboard.reviews')}</h2>
        {reviews.loading && <p role="status" className="px-1 text-xs text-fgmuted">{t('common.loading')}</p>}
        {reviews.error && <DashboardNotice error={reviews.error} stale={!!reviews.data} />}
        {reviews.data?.pendingCount === null && <Notice tone="info">{t('dashboard.unknownReviews')}</Notice>}
        {reviews.data?.items.length === 0 && reviews.data.pendingCount !== null && (
          <p className="px-1 text-xs text-fgmuted">{t('dashboard.noReviews')}</p>
        )}
        {!!reviews.data?.items.length && <ul className="space-y-1">
          {reviews.data.items.map((entry) => (
            <ItemRow key={entry.item.id} item={entry.item} priority={entry.state === 'pending'} onSelect={() => onSelect(entry.item)} />
          ))}
        </ul>}
      </section>
    )}
    <section aria-label={t(`dashboard.tab.${kind}`)} className="space-y-2 rounded-xl border border-edge bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto!" aria-label={t('dashboard.assignees')} value={assignee}
          onChange={(e) => setAssignee(e.target.value === 'any' ? 'any' : 'me')}>
          <option value="me">{t('dashboard.mine')}</option>
          <option value="any">{t('dashboard.everyone')}</option>
        </Select>
        <Select className="w-auto!" aria-label={t('dashboard.state')} value={state}
          onChange={(e) => setState(e.target.value === 'all' ? 'all' : 'open')}>
          <option value="open">{t('dashboard.state.open')}</option>
          <option value="all">{t('dashboard.allStates')}</option>
        </Select>
        <IconButton className="ml-auto" label={t('changes.refresh')}
          onClick={() => { list.refresh(); reviews.refresh() }}>
          <RefreshIcon size={15} />
        </IconButton>
      </div>
      {list.loading && <p role="status" className="px-1 text-xs text-fgmuted">{t('common.loading')}</p>}
      {list.error && <DashboardNotice error={list.error} stale={!!list.data} />}
      {list.data?.truncated && <Notice tone="info">{t('dashboard.partialList')}</Notice>}
      {list.data?.items.length === 0 && <p className="px-1 text-xs text-fgmuted">{t('dashboard.noItems')}</p>}
      {!!list.data?.items.length && <ul className="space-y-1">
        {list.data.items.map((item) => (
          <ItemRow key={item.id} item={item} priority={showReviews && pendingIds.has(item.id)} onSelect={() => onSelect(item)} />
        ))}
      </ul>}
    </section>
  </div>
}

export function GitDashboard(props: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<DashboardKind>('issue')
  const [selected, setSelected] = useState<DashboardItem | null>(null)
  return (
    <section aria-label={t('titlebar.mode.dashboard')} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-edge bg-bar">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge bg-panel px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{props.project.fullName}</h1>
          <p className="truncate text-xs text-fgmuted">{props.project.integrationName}</p>
        </div>
        <div role="tablist" aria-label={t('titlebar.mode.dashboard')} className="flex rounded-lg border border-edge bg-bar p-0.5">
          {TABS.map((kind) => (
            <button key={kind} id={`dashboard-tab-${kind}`} type="button" role="tab"
              aria-controls={`dashboard-panel-${kind}`} aria-selected={kind === tab} tabIndex={kind === tab ? 0 : -1}
              onClick={() => setTab(kind)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const next = event.key === 'Home' ? 'issue' : event.key === 'End' ? 'merge-request' : kind === 'issue' ? 'merge-request' : 'issue'
                setTab(next)
                document.getElementById(`dashboard-tab-${next}`)?.focus()
              }}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-fgmuted hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent aria-selected:bg-panel aria-selected:text-fg aria-selected:shadow-sm">
              {t(`dashboard.tab.${kind}`)}
            </button>
          ))}
        </div>
      </header>
      <DashboardItems key={tab} {...props} kind={tab} onSelect={setSelected} />
      {selected && <ItemDetail key={`${selected.kind}:${selected.id}`} folder={props.folder} project={props.project}
        item={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
