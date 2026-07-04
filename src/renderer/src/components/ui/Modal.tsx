import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'
import { CloseIcon } from './icons'

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
  initialFocusRef?: RefObject<HTMLElement>
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
}: Props): JSX.Element {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  // Escape to close.
  useEffect(() => {
    if (!dismissable) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissable, onClose])

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose()
      }}
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
            <IconButton size="sm" label={closeLabel ?? 'Close'} onClick={onClose} data-modal-close>
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
