import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isTopOverlay, popOverlay, pushOverlay } from '../../overlayStack'

export interface ComboboxOption {
  value: string
  /** shown instead of `value` when set */
  label?: string
  /** muted suffix, e.g. "in use" */
  hint?: string
  disabled?: boolean
}

interface Props {
  id?: string
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  /** shown in the list when nothing matches the query */
  emptyText: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

/** Every whitespace-separated token must appear in the text (case-insensitive). */
export function matchesQuery(text: string, query: string): boolean {
  const haystack = text.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

/**
 * A searchable single-select: type to filter, arrows + Enter to pick, Escape
 * to close. Styled to match ui/Input. The list is portaled with fixed
 * positioning so a scrolling Modal body never clips it, and it registers on
 * the overlay stack so Escape closes the list before the modal under it.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  emptyText,
  disabled,
  autoFocus,
  className = ''
}: Props): React.JSX.Element {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const filtered = useMemo(
    () => options.filter((o) => matchesQuery(o.label ?? o.value, query)),
    [options, query]
  )

  const firstEnabled = (list: ComboboxOption[]): number => list.findIndex((o) => !o.disabled)

  const openList = (): void => {
    if (disabled || open) return
    setQuery('')
    const selected = options.findIndex((o) => o.value === value && !o.disabled)
    setActive(selected >= 0 ? selected : firstEnabled(options))
    setOpen(true)
  }

  const close = (): void => {
    setOpen(false)
    setQuery('')
  }

  const pick = (option: ComboboxOption): void => {
    if (option.disabled) return
    onChange(option.value)
    close()
  }

  // Track the input's position while open (modal scroll, window resize).
  useLayoutEffect(() => {
    if (!open) return
    const update = (): void => setRect(inputRef.current?.getBoundingClientRect() ?? null)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  // Escape closes the list only (overlay stack), outside mousedown closes it.
  useEffect(() => {
    if (!open) return
    const layerId = pushOverlay()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isTopOverlay(layerId)) {
        e.stopPropagation()
        close()
      }
    }
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (inputRef.current?.contains(target) || listRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      popOverlay(layerId)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  // Keep the highlighted row visible.
  useEffect(() => {
    if (!open || active < 0) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const move = (step: 1 | -1): void => {
    if (filtered.length === 0) return
    let next = active
    for (let i = 0; i < filtered.length; i++) {
      next = (next + step + filtered.length) % filtered.length
      if (!filtered[next].disabled) break
    }
    setActive(next)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) openList()
      else move(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter' && open) {
      // Picking from the list must not also submit the surrounding form.
      e.preventDefault()
      const option = filtered[active]
      if (option) pick(option)
    } else if (e.key === 'Tab' && open) {
      close()
    }
  }

  const selected = options.find((o) => o.value === value)

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoFocus={autoFocus}
          disabled={disabled}
          value={open ? query : (selected?.label ?? value)}
          placeholder={open ? (selected?.label ?? value) || placeholder : placeholder}
          onChange={(e) => {
            if (!open) openList()
            const next = e.target.value
            setQuery(next)
            setActive(firstEnabled(options.filter((o) => matchesQuery(o.label ?? o.value, next))))
          }}
          onMouseDown={() => openList()}
          onKeyDown={onKeyDown}
          onBlur={close}
          autoComplete="off"
          spellCheck={false}
          className={`h-8 w-full rounded-md border border-edge bg-bar pl-2 pr-7 text-sm text-fg placeholder:text-fgmuted transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        />
        <svg
          className={`pointer-events-none absolute right-2.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-fgmuted transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {open &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            // Keep focus in the input so typing continues after a click.
            onMouseDown={(e) => e.preventDefault()}
            style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
            className="solid-surface fixed z-200 max-h-60 overflow-y-auto rounded-md border border-edge bg-panel py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-1.5 text-xs text-fgmuted">{emptyText}</li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  onMouseEnter={() => !option.disabled && setActive(index)}
                  onClick={() => pick(option)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs ${className} ${
                    option.disabled
                      ? 'cursor-default text-fgmuted'
                      : index === active
                        ? 'cursor-pointer bg-hover text-fg'
                        : 'cursor-pointer text-fg'
                  }`}
                >
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-accent">
                    {option.value === value ? '✓' : ''}
                  </span>
                  <span className="truncate">{option.label ?? option.value}</span>
                  {option.hint && <span className="ml-auto shrink-0 text-warn/80">{option.hint}</span>}
                </li>
              ))
            )}
          </ul>,
          document.body
        )}
    </>
  )
}
