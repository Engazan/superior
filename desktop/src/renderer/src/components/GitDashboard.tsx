import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type {
  DashboardFilter, DashboardItem, DashboardKind, DashboardProject, DashboardReviewState
} from '@shared/git-dashboard'
import { DASHBOARD_REFRESH_MS, useDashboardData } from '../hooks/useDashboardData'
import { useDashboardView, type DashboardView } from '../hooks/useDashboardView'
import type { useGitDashboard } from '../hooks/useGitDashboard'
import { useI18n } from '../i18n'
import { RefreshIcon, SearchIcon } from './ui'
import {
  Avatar, CheckStatusIcon, DashboardNotice, ItemDetail, ItemIcon, Labels, RelativeTime, itemRef, statusClass
} from './GitDashboardDetail'
import './GitDashboard.css'

interface Props {
  folder: string
  project: DashboardProject
  projectKey: string
  reviews: ReturnType<typeof useGitDashboard>['reviews']
}

const TABS: DashboardKind[] = ['issue', 'merge-request']
const PROVIDERS = { github: 'GitHub', gitlab: 'GitLab', gitea: 'Gitea' }
const blocked = (item: DashboardItem): boolean => item.conflicts === true || item.pipeline === 'failed'
const searchable = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function useList({ folder, project, projectKey }: Props, filter: DashboardFilter, enabled = true) {
  const { integrationId, fullName } = project
  const { kind, assignee, state } = filter
  const request = useCallback(() => window.api.dashboardList(folder, { integrationId, fullName }, { kind, assignee, state }),
    [folder, integrationId, fullName, kind, assignee, state])
  return useDashboardData(enabled ? JSON.stringify([projectKey, kind, assignee, state]) : null, request, DASHBOARD_REFRESH_MS)
}

function ItemRow({ item, selected, review, onSelect, now }: {
  item: DashboardItem
  selected: boolean
  now: number
  review?: DashboardReviewState
  onSelect: () => void
}) {
  const { t } = useI18n()
  const people = item.kind === 'issue' ? item.assignees : item.author ? [item.author] : []
  return <li>
    <button type="button" className={`row ${item.state === 'open' ? '' : 'done'}`}
      aria-current={selected ? 'true' : undefined} onClick={onSelect} data-item={item.id}>
      <ItemIcon kind={item.kind} status={statusClass(item)} />
      <span>
        <span className="row-title">{item.title}</span>
        <span className="row-meta">
          {review === 'pending' && <span className="flag warn">{t('dashboard.waiting')}</span>}
          {item.state === 'open' && item.draft && <span className="flag muted">{t('dashboard.draft')}</span>}
          {item.state === 'open' && item.pipeline === 'failed' && <span className="flag danger">{t('dashboard.pipeline.failed')}</span>}
          {item.state === 'open' && item.conflicts && <span className="flag danger">{t('dashboard.conflicts')}</span>}
          {item.state === 'open' && item.mergeReady && !blocked(item) && !item.draft && review !== 'pending' &&
            <span className="flag ok">{t('dashboard.mergeReady')}</span>}
          <span className="mono">{itemRef(item)}</span>
          <RelativeTime value={item.updatedAt} now={now} />
          {item.author && <span>{item.author}</span>}
          <Labels labels={item.labels} />
        </span>
      </span>
      <span className="row-side">
        {item.state === 'open' && item.pipeline && (
          <span className="stat" title={t(`dashboard.pipeline.${item.pipeline}`)}>
            <CheckStatusIcon status={item.pipeline} />
          </span>
        )}
        {!!item.comments && <span className="stat" title={t('dashboard.comments')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M21 11.5a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 11.5Z" />
          </svg>{item.comments}
        </span>}
        <span className="avs">{people.length ? people.map((person) => <Avatar key={person} person={person} />) : '—'}</span>
      </span>
    </button>
  </li>
}

export function GitDashboard(props: Props) {
  const { t } = useI18n()
  const { folder, project, reviews } = props
  const provider = PROVIDERS[project.provider]
  const segments = project.fullName.split('/')
  const name = segments.pop()
  const namespace = segments.join('/')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const [{ tab, selected, sheetOpen, assignee, state, query, view }, updateView] = useDashboardView(props.projectKey)
  const search = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const dashboardRef = useRef<HTMLElement>(null)
  const copy = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (document.activeElement === document.body ||
        document.activeElement?.closest('button[aria-pressed="true"]')?.closest('.superior-command-strip')) {
      dashboardRef.current?.focus({ preventScroll: true })
    }
  }, [])

  const mine = assignee === 'me' && state === 'open'
  const issues = useList(props, { kind: 'issue', assignee: 'me', state: 'open' })
  const merges = useList(props, { kind: 'merge-request', assignee: 'me', state: 'open' })
  const filtered = useList(props, { kind: tab, assignee, state }, !mine && view === 'items')
  const list = view === 'blocked' ? merges : mine ? tab === 'issue' ? issues : merges : filtered
  const relevant = view === 'reviews' ? reviews : list
  const reviewEntries = tab === 'merge-request' ? reviews.data?.items ?? [] : []
  const reviewStates = new Map(reviewEntries.map(({ item, state }) => [item.id, state]))
  const primaryItems = view === 'reviews' ? [] : (list.data?.items ?? []).filter((item) => view !== 'blocked' || blocked(item))
  const items = new Map(primaryItems.map((item) => [item.id, item]))
  if (view !== 'blocked') {
    for (const { item } of reviewEntries) if (!items.has(item.id)) items.set(item.id, item)
  }
  const q = searchable(query.trim())
  const visible = [...items.values()].filter((item) => !q || searchable(
    [item.title, itemRef(item), item.author, item.sourceBranch, ...item.assignees, ...(item.labels?.map(({ name }) => name) ?? [])].join(' ')
  ).includes(q)).sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open') || b.updatedAt.localeCompare(a.updatedAt))
  const pending = visible.filter((item) => reviewStates.get(item.id) === 'pending' && view !== 'blocked')
  const pendingIds = new Set(pending.map(({ id }) => id))
  const groups = [
    { label: t('dashboard.waiting'), items: pending, priority: true },
    { label: t(tab === 'issue' ? 'dashboard.state.open' : 'dashboard.other'), items: visible.filter((item) => item.state === 'open' && !pendingIds.has(item.id)) },
    { label: t('dashboard.state.closed'), items: visible.filter((item) => item.state !== 'open') }
  ]
  const ordered = groups.flatMap((group) => group.items)
  const selection = selected === undefined ? ordered[0] : ordered.find(({ id }) => id === selected)
  const reviewCount = reviews.data?.pendingCount
  const blockedItems = merges.data?.items.filter(blocked)
  const hasUnknownBlockers = merges.data?.truncated || merges.data?.items.some((item) =>
    !blocked(item) && (item.conflicts === undefined || item.pipeline !== 'passed'))
  const blockedCount = blockedItems && (hasUnknownBlockers
    ? blockedItems.length ? `${blockedItems.length}+` : undefined
    : blockedItems.length)
  const issueCount = issues.data && `${issues.data.items.length}${issues.data.truncated ? '+' : ''}`
  const busy = relevant.refreshing || (tab === 'merge-request' && reviews.refreshing)
  const outdated = !!(relevant.error || (tab === 'merge-request' && reviews.error))
  const showReviewNotice = tab === 'merge-request' && view !== 'blocked'
  const updatedAt = relevant.updatedAt

  function changeTab(kind: DashboardKind) {
    if (kind !== tab || view !== 'items') {
      updateView({ tab: kind, view: 'items', selected: undefined, sheetOpen: false })
    }
  }

  function focusTab(kind: DashboardKind) {
    changeTab(kind)
    document.getElementById(`dashboard-tab-${kind}`)?.focus()
  }

  function showTile(next: DashboardView) {
    updateView({
      tab: next === 'items' ? 'issue' : 'merge-request',
      view: next, query: '', assignee: 'me', state: 'open', selected: undefined, sheetOpen: false
    })
  }

  function refresh() {
    issues.refresh()
    merges.refresh()
    if (!mine && view === 'items') filtered.refresh()
    reviews.refresh()
  }

  function closeDetail() {
    const target = listRef.current?.querySelector<HTMLButtonElement>(`[data-item="${selection?.id}"]`)
    updateView({ selected: null, sheetOpen: false })
    requestAnimationFrame(() => target?.focus())
  }

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key.toLowerCase()
    if (event.target === search.current && key === 'escape') {
      updateView({ query: '' })
      dashboardRef.current?.focus()
      event.preventDefault()
      return
    }
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
    switch (key) {
      case '/': search.current?.focus(); break
      case '1': focusTab('issue'); break
      case '2': focusTab('merge-request'); break
      case 'r': refresh(); break
      case 'c':
        if (!selection) return
        copy.current?.click()
        break
      case 'escape':
        if (!selection) return
        closeDetail()
        break
      case 'enter':
        if (!selection || event.target !== dashboardRef.current) return
        updateView({ selected: selection.id, sheetOpen: true })
        break
      case 'j':
      case 'arrowdown':
      case 'arrowup':
      case 'k': {
        if (key.startsWith('arrow') && event.target instanceof HTMLElement &&
            !event.target.closest('.scroller, .git-dashboard:focus')) return
        const index = ordered.findIndex(({ id }) => id === selection?.id)
        const direction = key === 'j' || key === 'arrowdown' ? 1 : -1
        const next = ordered[Math.max(0, Math.min(ordered.length - 1, index + direction))]
        if (!next) return
        updateView({ selected: next.id })
        const row = listRef.current?.querySelector<HTMLButtonElement>(`[data-item="${next.id}"]`)
        row?.focus({ preventScroll: true })
        row?.scrollIntoView({ block: 'nearest' })
        break
      }
      default: return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const canReset = !!q || assignee !== 'any' || state !== 'all' || view !== 'items'
  const tiles = [
    { view: 'reviews', label: t('dashboard.attention.reviews'), count: reviewCount, tone: reviewCount ? 'warn' : '' },
    { view: 'blocked', label: t('dashboard.attention.blocked'), count: blockedCount, tone: blockedCount ? 'danger' : '' },
    { view: 'items', label: t('dashboard.attention.issues'), count: issueCount, tone: '' }
  ] as const
  const shortcuts = [
    [['J', 'K'], t('dashboard.keys.move')], [['1', '2'], t('dashboard.keys.tabs')],
    [['/'], t('dashboard.keys.search')], [['R'], t('changes.refresh')], [['C'], t('dashboard.copyUrl')]
  ] as const

  return <section ref={dashboardRef} tabIndex={-1} className="git-dashboard" aria-label={t('titlebar.mode.dashboard')} onKeyDown={handleKeys}>
    <div className={`workspace ${selection && sheetOpen ? 'has-detail' : ''}`}>
      <div className="main">
        <header className="phead">
          <span className="provider" title={project.integrationName}>{project.provider === 'gitlab' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d="M8 14.6 10.6 6.6H5.4ZM8 14.6 5.4 6.6H1.8ZM1.8 6.6 1 9.1c-.1.2 0 .5.2.6L8 14.6ZM1.8 6.6h3.6L3.9 1.9c-.1-.2-.4-.2-.5 0ZM8 14.6l2.6-8h3.6ZM14.2 6.6l.8 2.5c.1.2 0 .5-.2.6L8 14.6ZM14.2 6.6h-3.6l1.5-4.7c.1-.2.4-.2.5 0Z" />
            </svg>
          ) : <ItemIcon kind="merge-request" />}{provider}</span>
          <h1>{namespace && <span>{namespace} / </span>}{name}</h1>
          <div className={`sync ${outdated ? 'stale' : ''}`}>
            <span className="dot" aria-hidden="true" />
            <span role="status">{busy ? t('common.loading') : updatedAt
              ? <>{t(outdated ? 'dashboard.lastSync' : 'dashboard.synced')} <RelativeTime value={updatedAt} now={now} /></>
              : t('dashboard.syncUnavailable')}</span>
            <button type="button" className={`icon-btn ${busy ? 'spin' : ''}`} onClick={refresh}
              aria-label={t('changes.refresh')} title={`${t('changes.refresh')} (R)`}><RefreshIcon size={15} /></button>
          </div>
        </header>
        <section className="attn" aria-label={t('dashboard.attention')}>
          {tiles.map((tile) => <button type="button" key={tile.view}
            className={`tile ${tile.tone} ${tile.count == null || tile.count === 0 ? 'zero' : ''}`}
            aria-pressed={tile.view !== 'items' ? view === tile.view : undefined}
            onClick={() => showTile(tile.view)}>
            <span className="n">{tile.count ?? '–'}</span><span className="k">{tile.label}</span>
          </button>)}
        </section>
        <div className="tabs" role="tablist" aria-label={t('titlebar.mode.dashboard')}>
          {TABS.map((kind) => {
            const snapshot = kind === tab && view === 'items' ? list.data : (kind === 'issue' ? issues : merges).data
            const count = kind === tab ? visible.filter((item) => item.state === 'open').length : snapshot?.items.length
            const hasData = kind === tab ? !!relevant.data || !!visible.length : !!snapshot
            return <button type="button" className="tab" key={kind} role="tab" id={`dashboard-tab-${kind}`}
              aria-selected={kind === tab} aria-controls="dashboard-list" tabIndex={kind === tab ? 0 : -1}
              onClick={() => changeTab(kind)} onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const next = event.key === 'Home' ? 'issue' : event.key === 'End' ? 'merge-request' : kind === 'issue' ? 'merge-request' : 'issue'
                focusTab(next)
              }}>
              <ItemIcon kind={kind} />{kind === 'merge-request' && project.provider !== 'gitlab' ? t('dashboard.pullRequests') : t(`dashboard.tab.${kind}`)}
              <span className={`count ${kind === 'merge-request' && reviewCount ? 'alert' : ''}`}>{hasData ? `${count ?? 0}${snapshot?.truncated && !q ? '+' : ''}` : '·'}</span>
            </button>
          })}
        </div>
        <div className="toolbar">
          <label className="search">
            <SearchIcon size={15} />
            <input type="search" ref={search} autoComplete="off" value={query}
              aria-label={t('dashboard.keys.search')} placeholder={t('dashboard.search')}
              onChange={(event) => updateView({ query: event.target.value })} />
            <kbd>/</kbd>
          </label>
          <div className="seg" role="group" aria-label={t('dashboard.assignees')}>
            <button type="button" title={t('dashboard.mine')} aria-pressed={view === 'items' && assignee === 'me'}
              onClick={() => updateView({ view: 'items', assignee: 'me' })}>{t('dashboard.filter.mine')}</button>
            <button type="button" title={t('dashboard.everyone')} aria-pressed={view === 'items' && assignee === 'any'}
              onClick={() => updateView({ view: 'items', assignee: 'any' })}>{t('dashboard.filter.any')}</button>
          </div>
          <select className="select" aria-label={t('dashboard.state')} value={state}
            onChange={(event) => updateView({ view: 'items', state: event.target.value === 'all' ? 'all' : 'open' })}>
            <option value="open">{t('dashboard.state.open')}</option>
            <option value="all">{t('dashboard.allStates')}</option>
          </select>
        </div>
        <div className="scroller" role="tabpanel" id="dashboard-list" aria-labelledby={`dashboard-tab-${tab}`} ref={listRef}>
          {relevant.error && <DashboardNotice error={relevant.error} stale={!!relevant.data} onRetry={refresh} />}
          {showReviewNotice && view !== 'reviews' && reviews.error &&
            <DashboardNotice error={reviews.error} stale={!!reviews.data} onRetry={reviews.refresh} />}
          {showReviewNotice && reviewCount === null && <div className="notice info">{t('dashboard.unknownReviews')}</div>}
          {view !== 'reviews' && list.data?.truncated && <div className="notice info">{t('dashboard.partialList')}</div>}
          {view === 'blocked' && hasUnknownBlockers && <div className="notice info">{t('dashboard.unknownBlockers')}</div>}
          {relevant.loading && !visible.length && <div role="status" aria-label={t('common.loading')}>
            {Array.from({ length: 6 }, (_, i) => <div className="sk-row" key={i}>
              <span className="sk" /><div><span className="sk" style={{ width: `${70 - i * 6}%` }} /><span className="sk" style={{ width: `${40 + (i % 3) * 8}%` }} /></div><span className="sk" />
            </div>)}
          </div>}
          {!relevant.loading && !relevant.error && !visible.length && <div className="empty">
            <ItemIcon kind={tab} status="merged" size={24} />
            <h3>{t(view === 'reviews' && !q && reviewCount !== null ? 'dashboard.noReviews' : 'dashboard.noItems')}</h3>
            {canReset && <button type="button" className="btn" onClick={() =>
              updateView({ query: '', view: 'items', assignee: 'any', state: 'all' })
            }>{t('dashboard.showAll')}</button>}
          </div>}
          {groups.filter((group) => group.items.length > 0).map((group) => <section key={group.label}>
            <h2 className={`group ${group.priority ? 'attn-g' : ''}`}>{group.label}<span className="count">{group.items.length}</span></h2>
            <ul className="rows" aria-label={group.label}>{group.items.map((item) => <ItemRow key={item.id}
              item={item} now={now} selected={item.id === selection?.id} review={reviewStates.get(item.id)}
              onSelect={() => updateView({ selected: item.id, sheetOpen: true })} />)}</ul>
          </section>)}
        </div>
        <div className="hints" aria-hidden="true">{shortcuts.map(([keys, label]) => (
          <span key={label}>{keys.map((key) => <kbd key={key}>{key}</kbd>)} {label}</span>
        ))}</div>
      </div>
      <aside className="detail" aria-label={t('dashboard.detail')}>
        {selection
          ? <ItemDetail key={`${tab}:${selection.id}`} folder={folder} project={project} provider={provider}
              item={selection} now={now} review={reviewStates.get(selection.id)} onClose={closeDetail} copyRef={copy}
              sheetOpen={sheetOpen} />
          : <div className="d-empty"><ItemIcon kind={tab} size={24} /><strong>{t('dashboard.selectItem')}</strong></div>}
      </aside>
    </div>
  </section>
}
