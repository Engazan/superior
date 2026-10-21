import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SetStateAction
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import { useDismiss } from './ui'
import { SearchIcon } from './ui/icons'
import { filterCommands, type Command } from '../commands'

/*
 * Shared palette kit. The command palette, file/content search, prompt picker
 * and quick launch are keyboard-first overlays rather than Modals (no header,
 * no footer actions), but they share one shell, one search row, one result row
 * and one hint footer so they read as one family. The search input is an ARIA
 * combobox driving a listbox via aria-activedescendant, so focus never leaves
 * the input while ↑↓ move the highlight.
 */

/** Backdrop + floating panel, portalled to <body> so it never reflows the grid. */
export function PaletteShell({
  label,
  width,
  height = '',
  offset = 'pt-[12vh]',
  panelRef,
  onClose,
  children
}: {
  /** accessible name of the dialog */
  label: string
  /** max-width class, e.g. 'max-w-xl' */
  width: string
  /** max-height class for the panel */
  height?: string
  /** distance from the top of the window */
  offset?: string
  panelRef?: RefObject<HTMLDivElement | null>
  onClose: () => void
  children: ReactNode
}): React.JSX.Element {
  return createPortal(
    <div
      className={`fixed inset-0 z-100 flex items-start justify-center bg-black/40 px-4 ${offset}`}
      // mousedown + target check (as in ui/Modal): a drag that ends outside
      // the panel must not close it.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`solid-surface flex w-full flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl ${width} ${height}`}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

/** The search row: icon + borderless combobox input. */
export function PaletteSearch({
  listId,
  activeId,
  expanded,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  /** id of the listbox the input controls */
  listId: string
  /** id of the highlighted option, if any */
  activeId?: string
  expanded: boolean
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-edge px-3.5">
      <SearchIcon size={16} className="shrink-0 text-fgmuted" />
      <input
        autoFocus
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeId}
        autoComplete="off"
        spellCheck={false}
        className="h-11 min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fgmuted focus:outline-hidden"
        {...rest}
      />
    </div>
  )
}

/** One result row. Clicking selects; the pointer only moves the highlight. */
export function PaletteOption({
  id,
  active,
  title,
  onHover,
  onSelect,
  className = '',
  children
}: {
  id: string
  active: boolean
  title?: string
  onHover: () => void
  onSelect: (event: React.MouseEvent) => void
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-active={active || undefined}
      title={title}
      // mousemove (not mouseenter) so rows scrolling under a resting pointer
      // during keyboard navigation don't steal the highlight.
      onMouseMove={() => {
        if (!active) onHover()
      }}
      // Keep focus in the search input.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active ? 'bg-hover text-fg' : 'text-fgdim'
      } ${className}`}
    >
      {children}
    </div>
  )
}

/** Centered status line for the loading / empty / no-results states. */
export function PaletteMessage({
  className = 'px-3 py-8',
  children
}: {
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div role="status" className={`text-center text-sm text-fgmuted ${className}`}>
      {children}
    </div>
  )
}

/** Keyboard hint bar along the bottom edge. */
export function PaletteFooter({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t border-edge bg-bar px-3.5 py-2 text-[11px] text-fgmuted">
      {children}
    </div>
  )
}

export function PaletteHint({ keys, children }: { keys: string; children: ReactNode }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <Kbd>{keys}</Kbd>
      {children}
    </span>
  )
}

/** The standard Enter / Esc / ↑↓ legend. */
export function PaletteHints(): React.JSX.Element {
  const { t } = useI18n()
  return (
    <>
      <PaletteHint keys="Enter">{t('palette.open')}</PaletteHint>
      <PaletteHint keys="Esc">{t('palette.close')}</PaletteHint>
      <PaletteHint keys="↑↓">{t('palette.move')}</PaletteHint>
    </>
  )
}

export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <kbd className="shrink-0 rounded-md border border-edge bg-panel px-1.5 py-0.5 font-sans text-[11px] font-medium text-fg2">
      {children}
    </kbd>
  )
}

/**
 * The shared search-input key handling: ↑↓ move (clamped), Enter picks,
 * Escape closes. Keys never leak to the terminal or the global shortcuts.
 */
export function handlePaletteKey(
  e: React.KeyboardEvent<HTMLInputElement>,
  count: number,
  setIndex: Dispatch<SetStateAction<number>>,
  onEnter: (e: React.KeyboardEvent<HTMLInputElement>) => void,
  onClose: () => void
): void {
  e.stopPropagation()
  // An IME confirming a composition must not pick a result.
  if (e.nativeEvent.isComposing) return
  if (e.key === 'Escape') onClose()
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    setIndex((i) => Math.min(i + 1, Math.max(0, count - 1)))
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    setIndex((i) => Math.max(i - 1, 0))
  } else if (e.key === 'Enter') {
    e.preventDefault()
    onEnter(e)
  }
}

/** Keep the highlighted row scrolled into view. */
export function useActiveRowInView(listRef: RefObject<HTMLElement | null>, index: number): void {
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [listRef, index])
}

interface Props {
  commands: Command[]
  onClose: () => void
}

/**
 * ⌘K command palette: fuzzy-search every currently available action —
 * workspaces, presets, prompts, panels, git — grouped by section, driven
 * entirely by the keyboard (↑↓ move, Enter runs, Escape closes).
 */
export function CommandPalette({ commands, onClose }: Props): React.JSX.Element {
  const { t } = useI18n()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape must close the palette even when focus left the input; the
  // backdrop handles outside clicks itself.
  useDismiss(panelRef, true, onClose, { outside: false })

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useActiveRowInView(listRef, index)

  const run = (cmd: Command | undefined): void => {
    if (!cmd) return
    onClose()
    cmd.run()
  }

  // Group rows by section, preserving rank order within each group.
  const grouped = useMemo(() => {
    const bySection = new Map<string, Command[]>()
    for (const cmd of filtered) {
      const list = bySection.get(cmd.section) ?? []
      list.push(cmd)
      bySection.set(cmd.section, list)
    }
    return [...bySection.entries()]
  }, [filtered])

  const optionId = (i: number): string => `${listId}-${i}`

  return (
    <PaletteShell
      label={t('palette.placeholder')}
      width="max-w-4xl"
      height="max-h-[min(38rem,76vh)]"
      panelRef={panelRef}
      onClose={onClose}
    >
      <PaletteSearch
        listId={listId}
        activeId={filtered[index] ? optionId(index) : undefined}
        expanded={filtered.length > 0}
        aria-label={t('palette.placeholder')}
        placeholder={t('palette.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => handlePaletteKey(e, filtered.length, setIndex, () => run(filtered[index]), onClose)}
      />

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 && <PaletteMessage>{t('palette.noResults')}</PaletteMessage>}
        <div id={listId} role="listbox" aria-label={t('palette.placeholder')}>
          {grouped.map(([section, cmds], gi) => (
            <div key={section} role="group" aria-labelledby={`${listId}-g${gi}`}>
              <div
                id={`${listId}-g${gi}`}
                className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-fgmuted"
              >
                {section}
              </div>
              {cmds.map((cmd) => {
                const i = filtered.indexOf(cmd)
                return (
                  <PaletteOption
                    key={cmd.id}
                    id={optionId(i)}
                    active={i === index}
                    onHover={() => setIndex(i)}
                    onSelect={() => run(cmd)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">{cmd.title}</span>
                    {cmd.hint && <Kbd>{cmd.hint}</Kbd>}
                  </PaletteOption>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <PaletteFooter>
        <PaletteHints />
      </PaletteFooter>
    </PaletteShell>
  )
}
