import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { DiffFileView } from './DiffFileView'
import { Button, ChevronIcon, EmptyState, HistoryIcon, IconButton, Notice, RefreshIcon } from './ui'
import type { GitDiffFile, GitLogEntry } from '../types'

interface Props {
  folderPath: string | null
  /** Bumped by the parent after a commit/pull so the log refetches. */
  refreshToken: number
}

/** How many commits load initially and per "load more" click. */
const PAGE_SIZE = 50

/** Relative "2 h" / "3 d" style timestamp for a commit list. */
function relativeTime(tsSeconds: number, locale: string, justNow: string): string {
  const diff = Date.now() / 1000 - tsSeconds
  if (diff < 60) return justNow
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' })
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  if (diff < 30 * 86400) return rtf.format(-Math.round(diff / 86400), 'day')
  return new Date(tsSeconds * 1000).toLocaleDateString(locale)
}

/**
 * Commit history tab: the recent log, with each commit expandable into the
 * diff it introduced (fetched lazily on first expand). Paged — the log loads
 * PAGE_SIZE commits at a time with an explicit "load more" row, so truncation
 * is visible instead of silent.
 */
export function HistoryView({ folderPath, refreshToken }: Props): React.JSX.Element {
  const { t, lang } = useI18n()
  const [log, setLog] = useState<GitLogEntry[] | null>(null)
  const [logError, setLogError] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  // Local refresh/retry trigger (the parent's refreshToken covers commit/pull).
  const [reload, setReload] = useState(0)
  const [openHash, setOpenHash] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Record<string, GitDiffFile[] | 'loading' | 'error'>>({})
  // Monotonic token so a slow fetch can't overwrite a newer folder's log.
  const reqRef = useRef(0)

  useEffect(() => {
    setLog(null)
    setLogError(false)
    setOpenHash(null)
    setDiffs({})
    setLimit(PAGE_SIZE)
    if (!folderPath) return
    const token = ++reqRef.current
    window.api
      .gitLog(folderPath, PAGE_SIZE)
      .then((entries) => {
        if (token === reqRef.current) setLog(entries)
      })
      .catch(() => {
        if (token === reqRef.current) setLogError(true)
      })
  }, [folderPath, refreshToken, reload])

  const loadMore = (): void => {
    if (!folderPath || loadingMore) return
    const nextLimit = limit + PAGE_SIZE
    const token = ++reqRef.current
    setLoadingMore(true)
    window.api
      .gitLog(folderPath, nextLimit)
      .then((entries) => {
        if (token !== reqRef.current) return
        setLog(entries)
        setLimit(nextLimit)
        setLoadingMore(false)
      })
      .catch(() => {
        if (token !== reqRef.current) return
        setLoadingMore(false)
      })
  }

  const toggle = (hash: string): void => {
    if (openHash === hash) {
      setOpenHash(null)
      return
    }
    setOpenHash(hash)
    const cached = diffs[hash]
    if ((cached === undefined || cached === 'error') && folderPath) {
      setDiffs((prev) => ({ ...prev, [hash]: 'loading' }))
      window.api
        .gitShowCommit(folderPath, hash)
        .then((files) => {
          setDiffs((prev) => ({ ...prev, [hash]: files }))
        })
        .catch(() => {
          setDiffs((prev) => ({ ...prev, [hash]: 'error' }))
        })
    }
  }

  if (!folderPath) {
    return (
      <div className="p-3">
        <EmptyState icon={<HistoryIcon size={20} />} title={t('changes.notRepository')} />
      </div>
    )
  }

  // A full page means there may be more history below the cut.
  const maybeMore = log !== null && log.length >= limit

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-edge px-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 px-1 font-medium text-fgdim">
          <HistoryIcon size={14} className="shrink-0" />
          <span className="truncate">{t('rightPanel.history')}</span>
        </span>
        <span className="ml-auto" />
        <IconButton size="sm" label={t('history.refresh')} onClick={() => setReload((n) => n + 1)}>
          <RefreshIcon size={14} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {logError ? (
          <div className="p-3">
            <Notice
              action={
                <Button variant="secondary" size="xs" onClick={() => setReload((n) => n + 1)}>
                  {t('common.retry')}
                </Button>
              }
            >
              {t('history.loadFailed')}
            </Notice>
          </div>
        ) : log === null ? (
          <div role="status" className="px-3 py-4 text-xs text-fgmuted">
            {t('history.loading')}
          </div>
        ) : log.length === 0 ? (
          <div className="p-3">
            <EmptyState icon={<HistoryIcon size={20} />} title={t('history.empty')} />
          </div>
        ) : log.map((entry) => {
          const open = openHash === entry.hash
          const diff = diffs[entry.hash]
          return (
            <div key={entry.hash} className="border-b border-edge">
              <button
                type="button"
                onClick={() => toggle(entry.hash)}
                aria-expanded={open}
                className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs transition hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
              >
                <span className="mt-0.5 shrink-0 text-fgmuted">
                  <ChevronIcon size={10} direction={open ? 'down' : 'right'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg" title={entry.subject}>
                    {entry.subject}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-fgmuted">
                    <span className="font-mono">{entry.shortHash}</span> · {entry.author} ·{' '}
                    {relativeTime(entry.timestamp, lang, t('history.justNow'))}
                  </span>
                </span>
              </button>

              {open &&
                (diff === 'loading' || diff === undefined ? (
                  <div role="status" className="px-3 py-2 text-[11px] text-fgmuted">{t('history.loading')}</div>
                ) : diff === 'error' ? (
                  <div className="px-2 pb-2">
                    <Notice>{t('history.loadFailed')}</Notice>
                  </div>
                ) : diff.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-fgmuted">{t('changes.empty')}</div>
                ) : (
                  <div className="border-t border-edge">
                    {diff.map((file) => (
                      <DiffFileView
                        key={file.oldPath ? `${file.oldPath}>${file.path}` : file.path}
                        file={file}
                        defaultOpen={diff.length <= 3}
                      />
                    ))}
                  </div>
                ))}
            </div>
          )
        })}
        {maybeMore && (
          <div className="p-2">
            <Button variant="ghost" size="sm" className="w-full text-[11px]!" loading={loadingMore} onClick={loadMore}>
              {t('history.loadMore', { n: String(log.length) })}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
