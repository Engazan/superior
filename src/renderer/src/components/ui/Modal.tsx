import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'
import { CloseIcon } from './icons'
import { useOverlayLayer } from '../../overlayStack'
import { useI18n } from '../../i18n'

type Size = 'sm' | 'md' | 'lg'

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
  lg: 'max-w-xl'
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
  const restoreRef = useRef<HTMLElement | null>(null)
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
    restoreRef.current = document.activeElement as HTMLElement | null
    const target =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([data-modal-close])'
      )
    target?.focus()
    return () => restoreRef.current?.focus()
    // mount-only by design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-xs"
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
        className={`solid-surface flex max-h-full w-full flex-col rounded-xl border border-edge bg-panel p-5 shadow-2xl ${SIZE[size]}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h3>
            {description && (
              <p id={descId} className="mt-1 text-xs text-fgdim">
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

        {/* overflow-y-auto turns the horizontal axis into a clip box too (CSS
            promotes the sibling `visible` axis to `auto`), which would shave the
            outward focus ring off full-width inputs on their left/right edges.
            The `px-1 -mx-1` gives the ring room without shifting content. */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{children}</div>

        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
