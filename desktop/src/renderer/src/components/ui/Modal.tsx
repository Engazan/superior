import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'
import { CloseIcon } from './icons'
import { useOverlayLayer } from '../../overlayStack'
import { useI18n } from '../../i18n'

type Size = 'sm' | 'md' | 'lg' | 'xl'

interface Props {
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  size?: Size
  /** action row rendered under the body, right-aligned */
  footer?: ReactNode
  /** backdrop mousedown + Escape close the modal (default true) */
  dismissable?: boolean
  /** element focused on mount; falls back to the first focusable in the panel */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** accessible close-button label (i18n'd by the caller) */
  closeLabel?: string
  children: ReactNode
}

const SIZE: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-4xl'
}

/**
 * The app-wide modal. Centralizes what the six hand-rolled overlays diverged
 * on: backdrop style, Escape handling, safe backdrop dismissal (mousedown +
 * target check so a drag out of an input doesn't close it), ARIA wiring and
 * focus management. Rendered via portal so it never reflows the terminal grid.
 */
export function Modal({
  onClose,
  title,
  description,
  size = 'md',
  footer,
  dismissable = true,
  initialFocusRef,
  closeLabel,
  children
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  // Captured during the first render — before any child `autoFocus` moves
  // focus into the panel — so closing always returns focus to the opener.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  // Registered on the overlay stack so only the frontmost layer reacts to
  // Escape — closing a confirm dialog must never also close the modal under it.
  const layer = useOverlayLayer()

  // Escape to close (only while this modal is the top overlay).
  useEffect(() => {
    if (!dismissable) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && layer.isTop()) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissable, onClose])

  // Focus trap: Tab cycles inside the dialog instead of escaping into the app
  // behind it (aria-modal promises as much).
  const onTrapKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null)
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !panel.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }

  // Focus into the dialog on mount; restore focus on unmount.
  useEffect(() => {
    // A field with `autoFocus` already holds focus by now — keep it instead of
    // jumping to the first control.
    const focusedInside = panelRef.current?.contains(document.activeElement)
    if (initialFocusRef?.current || !focusedInside) {
      const target =
        initialFocusRef?.current ??
        panelRef.current?.querySelector<HTMLElement>(
          'input, select, textarea, button:not([data-modal-close])'
        )
      target?.focus()
    }
    return () => opener?.focus()
    // mount-only by design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-150 flex items-center justify-center bg-black/55 p-6 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose()
      }}
      onKeyDown={onTrapKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={`solid-surface flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl ${SIZE[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold leading-6 text-fg">
              {title}
            </h3>
            {description && (
              <p id={descId} className="mt-0.5 text-xs leading-5 text-fgdim">
                {description}
              </p>
            )}
          </div>
          {dismissable && (
            <IconButton
              size="sm"
              label={closeLabel ?? t('common.close')}
              onClick={onClose}
              data-modal-close
            >
              <CloseIcon size={14} />
            </IconButton>
          )}
        </div>

        {/* The padding lives inside the scroll box so the outward focus ring of
            full-width inputs is never clipped by the overflow edge. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-edge bg-bar px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
