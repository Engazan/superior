import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Extension } from '@codemirror/state'
import { useI18n } from '../i18n'
import type { FileContentMatch } from '../types'
import { loadCodeMirrorLanguage } from '../codeMirrorLanguage'
import { useDismiss } from './ui'
import { FileTypeIcon } from './FileTypeIcon'

const CodeFilePreview = lazy(() =>
  import('./CodeFilePreview').then(({ CodeFilePreview }) => ({ default: CodeFilePreview }))
)

interface Props {
  folderPath: string
  onOpenMatch: (match: FileContentMatch) => void | Promise<void>
  onClose: () => void
}

function relativePath(filePath: string, rootPath: string): string {
  return filePath.startsWith(rootPath)
    ? filePath.slice(rootPath.length).replace(/^[/\\]/, '')
    : filePath
}

function SourcePreview({ match, rootPath }: { match: FileContentMatch; rootPath: string }): React.JSX.Element {
  const relative = relativePath(match.path, rootPath)
  const content = useMemo(() => match.contextLines.map((line) => line.text).join('\n'), [match.contextLines])
  const sourceLineNumbers = useMemo(() => match.contextLines.map((line) => line.line), [match.contextLines])
  const [language, setLanguage] = useState<{ key: string; value: Extension | null } | null>(null)

  useEffect(() => {
    let active = true
    void loadCodeMirrorLanguage(match.name)
      .then((value) => {
        if (active) setLanguage({ key: match.name, value })
      })
      .catch(() => {
        if (active) setLanguage({ key: match.name, value: null })
      })
    return () => {
      active = false
    }
  }, [match.name])

  return (
    <section className="shrink-0 border-t border-edge" aria-label={`${relative}:${match.line}`}>
      <div className="flex h-9 items-center gap-2 border-b border-edge bg-bar px-3">
        <FileTypeIcon name={match.name} size={16} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{relative}</span>
        <span className="shrink-0 font-mono text-[11px] text-accent">
          {match.line}:{match.column}
        </span>
      </div>
      <div className="h-[200px] overflow-hidden bg-panel">
        <Suspense fallback={<div className="h-full bg-panel" />}>
          <CodeFilePreview
            content={content}
            language={language?.key === match.name ? language.value : null}
            sourceLineNumbers={sourceLineNumbers}
            highlightRange={{
              line: 4,
              from: match.matchStart,
              to: match.matchStart + match.matchLength
            }}
            compact
            searchable={false}
          />
        </Suspense>
      </div>
    </section>
  )
}

/** Project-wide literal content search with five results and a fixed source preview. */
export function ContentSearchPalette({
  folderPath,
  onOpenMatch,
  onClose
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileContentMatch[]>([])
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
        .searchFileContents(folderPath, value)
        .then((response) => {
          if (!active) return
          setResults(response.matches)
          setTruncated(response.truncated === true)
          setSearching(false)
          setSearched(true)
        })
        .catch((error) => {
          if (!active) return
          console.error('[content-search] failed:', error)
          setResults([])
          setTruncated(false)
          setSearching(false)
          setSearched(true)
        })
    }, 300)

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

  const open = (match: FileContentMatch | undefined): void => {
    if (match) void onOpenMatch(match)
  }
  const activeMatch = !searching ? results[index] : undefined

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-start justify-center bg-black/40 pt-16"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('keyboard.searchFileContents')}
        onClick={(event) => event.stopPropagation()}
        className="solid-surface flex max-h-[calc(100vh-5rem)] w-3xl flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-edge px-3">
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
            aria-label={t('contentSearch.placeholder')}
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
            placeholder={t('contentSearch.placeholder')}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-fg placeholder:text-fgmuted focus:outline-hidden"
          />
          <span className="shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-fgmuted">
            Esc
          </span>
        </div>

        <div ref={listRef} className="h-[200px] shrink-0 overflow-y-auto">
          {searching && (
            <div className="grid h-full place-items-center text-sm text-fgmuted">{t('files.searching')}</div>
          )}
          {!searching && searched && results.length === 0 && (
            <div className="grid h-full place-items-center text-sm text-fgmuted">
              {t('contentSearch.noResults')}
            </div>
          )}
          {!searching && results.map((match, resultIndex) => {
            const relative = relativePath(match.path, folderPath)
            return (
              <button
                key={`${match.path}:${match.line}:${match.column}`}
                data-active={resultIndex === index || undefined}
                title={`${relative}:${match.line}:${match.column}`}
                onMouseEnter={() => setIndex(resultIndex)}
                onClick={() => open(match)}
                className={`flex h-10 w-full items-center gap-2 border-b border-edge/60 px-3 text-left transition ${
                  resultIndex === index ? 'bg-hover' : ''
                }`}
              >
                <FileTypeIcon name={match.name} size={16} />
                <span className="shrink-0 text-sm font-medium text-fg">{match.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-fgmuted">{relative}</span>
                <span className="shrink-0 font-mono text-[11px] text-accent">
                  {match.line}:{match.column}
                </span>
              </button>
            )
          })}
        </div>

        {!searching && truncated && (
          <div className="shrink-0 border-t border-edge px-3 py-1 text-[11px] text-fgmuted">
            {t('contentSearch.truncated')}
          </div>
        )}
        {activeMatch && <SourcePreview match={activeMatch} rootPath={folderPath} />}
      </div>
    </div>,
    document.body
  )
}
