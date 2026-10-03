import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import type { FsEntry } from '../types'
import { useDismiss } from './ui'
import { FileTypeIcon } from './FileTypeIcon'

interface Props {
  folderPath: string
  onOpenFile: (file: FsEntry) => void | Promise<void>
  onClose: () => void
}

function relativeParts(entry: FsEntry, rootPath: string): { relative: string; directory: string } {
  const relative = entry.path.startsWith(rootPath)
    ? entry.path.slice(rootPath.length).replace(/^[/\\]/, '')
    : entry.path
  const directory = relative.slice(0, Math.max(0, relative.length - entry.name.length)).replace(/[/\\]$/, '')
  return { relative, directory }
}

/** Keyboard-first project file search opened by double Shift. */
export function FileSearchPalette({ folderPath, onOpenFile, onClose }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FsEntry[]>([])
  const [index, setIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useDismiss(panelRef, true, onClose, { outside: false })

  useEffect(() => {
    const value = query.trim()
    setIndex(0)
    if (!value) {
      setResults([])
      setSearching(false)
      setSearched(false)
      setTruncated(false)
      return
    }

    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void window.api
        .searchFiles(folderPath, value)
        .then((response) => {
          if (!active) return
          setResults(response.entries)
          setTruncated(response.truncated === true)
          setSearching(false)
          setSearched(true)
        })
        .catch((error) => {
          if (!active) return
          console.error('[file-search] failed:', error)
          setResults([])
          setTruncated(false)
          setSearching(false)
          setSearched(true)
        })
    }, 150)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [folderPath, query])

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const open = (entry: FsEntry | undefined): void => {
    if (!entry) return
    void onOpenFile(entry)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-start justify-center bg-black/40 pt-24"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        className="solid-surface flex max-h-104 w-xl flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-edge px-3">
          <svg
            className="h-4 w-4 shrink-0 text-fgmuted"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            autoFocus
            value={query}
            aria-label={t('files.search')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Escape') onClose()
              else if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((current) => Math.max(current - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                open(results[index])
              }
            }}
            placeholder={t('files.search')}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-fg placeholder:text-fgmuted focus:outline-hidden"
          />
          <span className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-fgmuted">
            Esc
          </span>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {searching && (
            <div className="px-3 py-6 text-center text-sm text-fgmuted">{t('files.searching')}</div>
          )}
          {!searching && searched && results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-fgmuted">{t('files.noResults')}</div>
          )}
          {!searching &&
            results.map((entry, resultIndex) => {
              const { relative, directory } = relativeParts(entry, folderPath)
              return (
                <button
                  key={entry.path}
                  data-active={resultIndex === index || undefined}
                  title={relative}
                  onMouseEnter={() => setIndex(resultIndex)}
                  onClick={() => open(entry)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                    resultIndex === index ? 'bg-hover text-fg' : 'text-fgdim'
                  }`}
                >
                  <FileTypeIcon name={entry.name} size={16} />
                  <span className="min-w-0 flex-1 truncate text-fg">{entry.name}</span>
                  {directory && (
                    <span className="max-w-1/2 shrink truncate text-xs text-fgmuted">
                      {directory}
                    </span>
                  )}
                </button>
              )
            })}
          {!searching && truncated && (
            <div className="px-3 py-1.5 text-[11px] text-fgmuted">
              {t('files.searchTruncated')}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
