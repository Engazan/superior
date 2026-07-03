import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { DiffFileView } from './DiffFileView'
import { ChevronIcon } from './ui'
import type { GitDiffFile, GitLogEntry } from '../types'

interface Props {
  folderPath: string | null
  /** Bumped by the parent after a commit/pull so the log refetches. */
  refreshToken: number
}

/** Relative "2 h" / "3 d" style timestamp for a commit list. */
function relativeTime(tsSeconds: number, locale: string): string {
  const diff = Date.now() / 1000 - tsSeconds
  if (diff < 60) return '<1 min'
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' })
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  if (diff < 30 * 86400) return rtf.format(-Math.round(diff / 86400), 'day')
  return new Date(tsSeconds * 1000).toLocaleDateString(locale)
}

/**
 * Commit history tab: the recent log, with each commit expandable into the
 * diff it introduced (fetched lazily on first expand).
 */
export function HistoryView({ folderPath, refreshToken }: Props): JSX.Element {
  const { t, lang } = useI18n()
  const [log, setLog] = useState<GitLogEntry[] | null>(null)
  const [openHash, setOpenHash] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Record<string, GitDiffFile[] | 'loading'>>({})
  // Monotonic token so a slow fetch can't overwrite a newer folder's log.
  const reqRef = useRef(0)

  useEffect(() => {
    setLog(null)
    setOpenHash(null)
    setDiffs({})
    if (!folderPath) return
    const token = ++reqRef.current
    void window.api.gitLog(folderPath).then((entries) => {
      if (token === reqRef.current) setLog(entries)
    })
  }, [folderPath, refreshToken])

  const toggle = (hash: string): void => {
    if (openHash === hash) {
      setOpenHash(null)
      return
    }
    setOpenHash(hash)
    if (!diffs[hash] && folderPath) {
      setDiffs((prev) => ({ ...prev, [hash]: 'loading' }))
      void window.api.gitShowCommit(folderPath, hash).then((files) => {
        setDiffs((prev) => ({ ...prev, [hash]: files }))
      })
    }
  }

  if (!folderPath) {
    return <div className="px-3 py-4 text-xs text-fgmuted">{t('changes.notRepository')}</div>
  }
  if (log === null) {
    return <div className="px-3 py-4 text-xs text-fgmuted">{t('history.loading')}</div>
  }
  if (log.length === 0) {
    return <div className="px-3 py-4 text-xs text-fgmuted">{t('history.empty')}</div>
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {log.map((entry) => {
        const open = openHash === entry.hash
        const diff = diffs[entry.hash]
        return (
          <div key={entry.hash} className="border-b border-edge">
            <button
              onClick={() => toggle(entry.hash)}
              className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs transition hover:bg-hover"
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
                  {relativeTime(entry.timestamp, lang)}
                </span>
              </span>
            </button>

            {open &&
              (diff === 'loading' || diff === undefined ? (
                <div className="px-3 py-2 text-[11px] text-fgmuted">{t('history.loading')}</div>
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
    </div>
  )
}
