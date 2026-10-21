import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import type { FsEntry } from '../types'
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
  const listId = useId()
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

  useActiveRowInView(listRef, index)

  const open = (entry: FsEntry | undefined): void => {
    if (!entry) return
    void onOpenFile(entry)
  }

  const shown = searching ? [] : results
  const optionId = (i: number): string => `${listId}-${i}`

  return (
    <PaletteShell
      label={t('files.search')}
      width="max-w-xl"
      height="max-h-104"
      panelRef={panelRef}
      onClose={onClose}
    >
      <PaletteSearch
        listId={listId}
        activeId={shown[index] ? optionId(index) : undefined}
        expanded={shown.length > 0}
        aria-label={t('files.search')}
        placeholder={t('files.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => handlePaletteKey(event, shown.length, setIndex, () => open(shown[index]), onClose)}
      />

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5 empty:hidden">
        {searching && <PaletteMessage>{t('files.searching')}</PaletteMessage>}
        {!searching && searched && results.length === 0 && (
          <PaletteMessage>{t('files.noResults')}</PaletteMessage>
        )}
        {shown.length > 0 && (
          <div id={listId} role="listbox" aria-label={t('files.search')}>
            {shown.map((entry, resultIndex) => {
              const { relative, directory } = relativeParts(entry, folderPath)
              return (
                <PaletteOption
                  key={entry.path}
                  id={optionId(resultIndex)}
                  active={resultIndex === index}
                  title={relative}
                  onHover={() => setIndex(resultIndex)}
                  onSelect={() => open(entry)}
                >
                  <FileTypeIcon name={entry.name} size={16} />
                  <span className="min-w-0 flex-1 truncate text-fg">{entry.name}</span>
                  {directory && (
                    <span className="max-w-1/2 shrink truncate text-xs text-fgmuted">{directory}</span>
                  )}
                </PaletteOption>
              )
            })}
          </div>
        )}
        {!searching && truncated && (
          <div className="px-3 py-1.5 text-[11px] text-fgmuted">{t('files.searchTruncated')}</div>
        )}
      </div>

      <PaletteFooter>
        <PaletteHints />
      </PaletteFooter>
    </PaletteShell>
  )
}
