import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { getSearch } from '../terminalSearch'
import { ChevronIcon, CloseIcon, IconButton } from './ui'

interface Props {
  /** the terminal whose scrollback is being searched */
  sessionId: string
  onClose: () => void
}

// Decorations must be requested for the addon to report result counts (and
// they make every match visible in the scrollback + overview ruler).
const SEARCH_DECORATIONS = {
  matchBackground: '#eab30855',
  activeMatchBackground: '#f59e0b88',
  matchOverviewRuler: '#eab308',
  activeMatchColorOverviewRuler: '#f59e0b'
}

/**
 * Floating find-in-terminal bar (⌘F). Drives the session's SearchAddon via the
 * terminalSearch registry; Enter/▼ = next, Shift+Enter/▲ = previous, Escape
 * closes and returns focus to the terminal. Shows a live "3/17" match counter
 * so an empty result is distinguishable from a single one.
 */
export function TerminalSearchOverlay({ sessionId, onClose }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ index: number; count: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const find = (next: boolean): void => {
    const entry = getSearch(sessionId)
    if (!entry || !query) return
    const options = { decorations: SEARCH_DECORATIONS }
    if (next) entry.addon.findNext(query, options)
    else entry.addon.findPrevious(query, options)
  }

  // Subscribe to result counts; switching the active session mid-search clears
  // the old terminal's decorations instead of leaving them stranded.
  useEffect(() => {
    const entry = getSearch(sessionId)
    if (!entry) return
    const sub = entry.addon.onDidChangeResults(({ resultIndex, resultCount }) => {
      setResult({ index: resultIndex, count: resultCount })
    })
    return () => {
      sub.dispose()
      entry.addon.clearDecorations()
      setResult(null)
    }
  }, [sessionId])

  // Live incremental search as the query changes.
  useEffect(() => {
    const entry = getSearch(sessionId)
    if (!entry) return
    if (query) {
      entry.addon.findNext(query, { incremental: true, decorations: SEARCH_DECORATIONS })
    } else {
      entry.addon.clearDecorations()
      setResult(null)
    }
  }, [query, sessionId])

  const close = (): void => {
    const entry = getSearch(sessionId)
    entry?.addon.clearDecorations()
    onClose()
    entry?.terminal.focus()
  }

  // SearchAddon reports -1 when there are more matches than it will track.
  const counter =
    !query || result === null
      ? null
      : result.count === 0
        ? t('search.noResults')
        : result.count < 0
          ? '1000+'
          : `${Math.max(result.index + 1, 1)}/${result.count}`

  return (
    <div className="solid-surface fixed right-6 top-16 z-90 flex items-center gap-1 rounded-lg border border-edge bg-panel p-1.5 shadow-xl">
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') find(!e.shiftKey)
          else if (e.key === 'Escape') close()
        }}
        placeholder={t('search.placeholder')}
        className="h-7 w-48 rounded-md border border-edge bg-bar px-2 text-xs text-fg placeholder:text-fgmuted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
      />
      {counter !== null && (
        <span
          aria-live="polite"
          className={`min-w-10 shrink-0 px-1 text-center font-mono text-[11px] tabular-nums ${
            result?.count === 0 ? 'text-warn' : 'text-fgmuted'
          }`}
        >
          {counter}
        </span>
      )}
      <IconButton size="sm" label={t('search.previous')} onClick={() => find(false)}>
        <ChevronIcon size={13} direction="up" />
      </IconButton>
      <IconButton size="sm" label={t('search.next')} onClick={() => find(true)}>
        <ChevronIcon size={13} direction="down" />
      </IconButton>
      <IconButton size="sm" label={t('search.close')} onClick={close}>
        <CloseIcon size={12} />
      </IconButton>
    </div>
  )
}
