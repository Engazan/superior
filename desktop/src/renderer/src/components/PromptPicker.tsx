import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useDismiss } from './ui'
import type { Prompt } from '../types'
import {
  PaletteFooter,
  PaletteHint,
  PaletteMessage,
  PaletteOption,
  PaletteSearch,
  PaletteShell,
  handlePaletteKey,
  useActiveRowInView
} from './CommandPalette'

interface Props {
  /** Insert the chosen prompt's text into the active terminal.
      `submit` = also press Enter (Shift+Enter in the picker). */
  onPick: (prompt: Prompt, submit: boolean) => void
  onClose: () => void
}

/**
 * Centered overlay listing the saved prompts: type to filter, ↑↓ to move,
 * Enter inserts into the active terminal (Shift+Enter inserts and submits),
 * Escape closes. Prompts load fresh on every open so settings edits show up.
 */
export function PromptPicker({ onPick, onClose }: Props): React.JSX.Element {
  const { t } = useI18n()
  const listId = useId()
  const [prompts, setPrompts] = useState<Prompt[] | null>(null)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Register on the overlay stack: the global shortcut gate consults it, so
  // ⌘W (and friends) can't reach through the open picker and kill a terminal.
  // Also makes Escape work when focus isn't in the input (the backdrop handles
  // outside clicks itself).
  useDismiss(panelRef, true, onClose, { outside: false })

  useEffect(() => {
    window.api
      .listPrompts()
      .then((state) => setPrompts(state.prompts))
      // A failed load would otherwise sit on "Loading…" forever.
      .catch(() => setPrompts([]))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = prompts ?? []
    if (!q) return all
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || p.text.toLowerCase().includes(q)
    )
  }, [prompts, query])

  // Keep the highlight in range as the filter narrows.
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  useActiveRowInView(listRef, index)

  const pick = (prompt: Prompt | undefined, submit: boolean): void => {
    if (!prompt) return
    onPick(prompt, submit)
    onClose()
  }

  const optionId = (i: number): string => `${listId}-${i}`

  return (
    <PaletteShell
      label={t('prompts.pickerPlaceholder')}
      width="max-w-md"
      height="max-h-96"
      panelRef={panelRef}
      onClose={onClose}
    >
      <PaletteSearch
        listId={listId}
        activeId={filtered[index] ? optionId(index) : undefined}
        expanded={filtered.length > 0}
        aria-label={t('prompts.pickerPlaceholder')}
        placeholder={t('prompts.pickerPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) =>
          handlePaletteKey(e, filtered.length, setIndex, (ev) => pick(filtered[index], ev.shiftKey), onClose)
        }
      />

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {prompts === null ? (
          <PaletteMessage>{t('common.loading')}</PaletteMessage>
        ) : prompts.length === 0 ? (
          <PaletteMessage>{t('prompts.empty')}</PaletteMessage>
        ) : (
          filtered.length === 0 && <PaletteMessage>{t('search.noResults')}</PaletteMessage>
        )}
        {filtered.length > 0 && (
          <div id={listId} role="listbox" aria-label={t('prompts.pickerPlaceholder')}>
            {filtered.map((p, i) => (
              <PaletteOption
                key={p.id}
                id={optionId(i)}
                active={i === index}
                onHover={() => setIndex(i)}
                onSelect={(e) => pick(p, e.shiftKey)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{p.name}</span>
                  <span className="block truncate text-xs text-fgmuted">{p.text}</span>
                </span>
              </PaletteOption>
            ))}
          </div>
        )}
      </div>

      <PaletteFooter>
        <span className="mr-auto">{t('prompts.pickerHint')}</span>
        <PaletteHint keys="Esc">{t('palette.close')}</PaletteHint>
      </PaletteFooter>
    </PaletteShell>
  )
}
