import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import type { Prompt } from '../types'

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
export function PromptPicker({ onPick, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [prompts, setPrompts] = useState<Prompt[] | null>(null)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.listPrompts().then((state) => setPrompts(state.prompts))
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

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const pick = (prompt: Prompt | undefined, submit: boolean): void => {
    if (!prompt) return
    onPick(prompt, submit)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-28"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-96 w-96 flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-xl"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              pick(filtered[index], e.shiftKey)
            }
          }}
          placeholder={t('prompts.pickerPlaceholder')}
          className="border-b border-edge bg-transparent px-3 py-2.5 text-sm text-fg placeholder:text-fgmuted focus:outline-none"
        />

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {prompts !== null && filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-fgmuted">
              {t('prompts.empty')}
            </div>
          )}
          {filtered.map((p, i) => (
            <button
              key={p.id}
              data-active={i === index || undefined}
              onMouseEnter={() => setIndex(i)}
              onClick={(e) => pick(p, e.shiftKey)}
              className={`block w-full px-3 py-2 text-left transition ${
                i === index ? 'bg-hover' : ''
              }`}
            >
              <span className="block truncate text-sm text-fg">{p.name}</span>
              <span className="block truncate text-xs text-fgmuted">{p.text}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-edge px-3 py-1.5 text-[10px] text-fgmuted">
          {t('prompts.pickerHint')}
        </div>
      </div>
    </div>,
    document.body
  )
}
