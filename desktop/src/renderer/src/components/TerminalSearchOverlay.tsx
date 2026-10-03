import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { clearTerminalSearch, findInTerminal, focusTerminal } from '../terminalSearch'
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
export function TerminalSearchOverlay({ sessionId, onClose }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const find = (next: boolean): void => {
    findInTerminal(sessionId, query, next ? 'next' : 'previous')
  }

  // Live incremental search as the query changes.
  useEffect(() => {
    if (query) {
      findInTerminal(sessionId, query, 'next', { incremental: true })
    } else {
      clearTerminalSearch(sessionId)
    }
    return () => clearTerminalSearch(sessionId)
  }, [query, sessionId])

  const close = (): void => {
    clearTerminalSearch(sessionId)
    onClose()
    focusTerminal(sessionId)
  }

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
