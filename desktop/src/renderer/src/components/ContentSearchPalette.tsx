import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Extension } from '@codemirror/state'
import { useI18n } from '../i18n'
import type { FileContentMatch } from '../types'
import { loadCodeMirrorLanguage } from '../codeMirrorLanguage'
import { useDismiss } from './ui'
import { FileTypeIcon } from './FileTypeIcon'
import {
  PaletteFooter,
  PaletteHints,
  PaletteMessage,
  PaletteOption,
  PaletteSearch,
  PaletteShell,
  handlePaletteKey,
  useActiveRowInView
} from './CommandPalette'

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
      <div className="flex h-9 items-center gap-2 border-b border-edge bg-bar px-3.5">
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
  const listId = useId()
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

  useActiveRowInView(listRef, index)

  const open = (match: FileContentMatch | undefined): void => {
    if (match) void onOpenMatch(match)
  }
  const shown = searching ? [] : results
  const activeMatch = shown[index]
  const optionId = (i: number): string => `${listId}-${i}`

  return (
    <PaletteShell
      label={t('keyboard.searchFileContents')}
      width="max-w-3xl"
      height="max-h-[calc(100vh-5rem)]"
      offset="pt-16"
      panelRef={panelRef}
      onClose={onClose}
    >
      <PaletteSearch
        listId={listId}
        activeId={activeMatch ? optionId(index) : undefined}
        expanded={shown.length > 0}
        aria-label={t('contentSearch.placeholder')}
        placeholder={t('contentSearch.placeholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => handlePaletteKey(event, shown.length, setIndex, () => open(shown[index]), onClose)}
      />

      {/* Fixed height so the preview below never jumps while results change. */}
      <div ref={listRef} className="h-[200px] shrink-0 overflow-y-auto p-1.5">
        {searching && (
          <PaletteMessage className="grid h-full place-items-center">{t('files.searching')}</PaletteMessage>
        )}
        {!searching && searched && results.length === 0 && (
          <PaletteMessage className="grid h-full place-items-center">
            {t('contentSearch.noResults')}
          </PaletteMessage>
        )}
        {shown.length > 0 && (
          <div id={listId} role="listbox" aria-label={t('contentSearch.placeholder')}>
            {shown.map((match, resultIndex) => {
              const relative = relativePath(match.path, folderPath)
              return (
                <PaletteOption
                  key={`${match.path}:${match.line}:${match.column}`}
                  id={optionId(resultIndex)}
                  active={resultIndex === index}
                  title={`${relative}:${match.line}:${match.column}`}
                  onHover={() => setIndex(resultIndex)}
                  onSelect={() => open(match)}
                >
                  <FileTypeIcon name={match.name} size={16} />
                  <span className="shrink-0 font-medium text-fg">{match.name}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-fgmuted">{relative}</span>
                  <span className="shrink-0 font-mono text-[11px] text-accent">
                    {match.line}:{match.column}
                  </span>
                </PaletteOption>
              )
            })}
          </div>
        )}
      </div>

      {!searching && truncated && (
        <div className="shrink-0 border-t border-edge px-3.5 py-1 text-[11px] text-fgmuted">
          {t('contentSearch.truncated')}
        </div>
      )}
      {activeMatch && <SourcePreview match={activeMatch} rootPath={folderPath} />}

      <PaletteFooter>
        <PaletteHints />
      </PaletteFooter>
    </PaletteShell>
  )
}
