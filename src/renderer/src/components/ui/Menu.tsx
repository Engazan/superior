import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayLayer } from '../../overlayStack'

export type MenuItem =
  | {
      id: string
      label: string
      icon?: ReactNode
      /** danger renders the row in the danger tone */
      tone?: 'danger'
      disabled?: boolean
      onSelect: () => void
    }
  | 'separator'

interface Props {
  items: MenuItem[]
  /** anchor element (menu drops below it) or a cursor point (context menu) */
  anchor: HTMLElement | { x: number; y: number }
  onClose: () => void
}

/**
 * One dropdown/context menu for the whole app: kebab buttons and right-click
 * share it, so both affordances always offer the identical actions. Portal-
 * rendered, viewport-clamped, with arrow-key roving focus and Escape/outside
 * dismissal.
 */
export function Menu({ items, anchor, onClose }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const layer = useOverlayLayer()

  // Place at the anchor, then clamp to the viewport once measured.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const base =
      anchor instanceof HTMLElement
        ? (() => {
            const r = anchor.getBoundingClientRect()
            return { x: r.left, y: r.bottom + 4 }
          })()
        : anchor
    const { width, height } = el.getBoundingClientRect()
    const left = Math.min(base.x, window.innerWidth - width - 8)
    const top = Math.min(base.y, window.innerHeight - height - 8)
    setPos({ top: Math.max(8, top), left: Math.max(8, left) })
  }, [anchor])

  // Dismiss on outside mousedown / Escape; arrow keys move focus between items.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Only the frontmost overlay closes — a menu under a modal stays put.
        if (!layer.isTop()) return
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const buttons = Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
      )
      if (buttons.length === 0) return
      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next =
        e.key === 'ArrowDown'
          ? buttons[(idx + 1) % buttons.length]
          : buttons[(idx - 1 + buttons.length) % buttons.length]
      next.focus()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, layer])

  // Focus the first item so keyboard users land inside the menu; restore focus
  // to the opener when the menu closes so keyboard flow isn't dropped.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => opener?.focus()
  }, [])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
      className="solid-surface fixed z-100 min-w-40 overflow-hidden rounded-lg border border-edge bg-panel py-1 shadow-xl"
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={`sep-${i}`} className="my-1 border-t border-edge" role="separator" />
        ) : (
          <button
            key={item.id}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-40 ${
              item.tone === 'danger'
                ? 'text-danger hover:bg-dangerBg focus-visible:bg-dangerBg'
                : 'text-fg hover:bg-hover focus-visible:bg-hover'
            }`}
          >
            {item.icon && <span className="flex w-4 shrink-0 justify-center">{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  )
}
