import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { getSearch } from '../terminalSearch'
import { ChevronIcon, CloseIcon, IconButton } from './ui'

interface Props {
  /** the terminal whose scrollback is being searched */
  sessionId: string
  onClose: () => void
}

/**
 * Floating find-in-terminal bar (⌘F). Drives the session's SearchAddon via the
 * terminalSearch registry; Enter/▼ = next, Shift+Enter/▲ = previous, Escape
 * closes and returns focus to the terminal.
 */
export function TerminalSearchOverlay({ sessionId, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const find = (next: boolean): void => {
    const entry = getSearch(sessionId)
    if (!entry || !query) return
    if (next) entry.addon.findNext(query, { incremental: false })
    else entry.addon.findPrevious(query)
  }

  // Live incremental search as the query changes.
  useEffect(() => {
    const entry = getSearch(sessionId)
    if (!entry) return
    if (query) entry.addon.findNext(query, { incremental: true })
    else entry.addon.clearDecorations()
  }, [query, sessionId])

  const close = (): void => {
    const entry = getSearch(sessionId)
    entry?.addon.clearDecorations()
    onClose()
    entry?.terminal.focus()
  }

  return (
    <div className="fixed right-6 top-16 z-[90] flex items-center gap-1 rounded-lg border border-edge bg-panel p-1.5 shadow-xl">
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
        className="h-7 w-48 rounded-md border border-edge bg-bar px-2 text-xs text-fg placeholder:text-fgmuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
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
