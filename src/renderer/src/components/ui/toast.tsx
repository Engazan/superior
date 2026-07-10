import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'
import { useI18n } from '../../i18n'

type Tone = 'success' | 'error' | 'info'

interface Toast {
  id: number
  tone: Tone
  message: string
  /** sticky toasts stay until dismissed (used for errors) */
  sticky?: boolean
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string, opts?: { sticky?: boolean }) => void
  info: (message: string) => void
}

// Split contexts: components consume only the stable dispatch API, so pushing
// a toast never re-renders the app tree (protects the terminal grid); only the
// portal viewport subscribes to the toast list itself.
const ToastApiContext = createContext<ToastApi | null>(null)
const ToastListContext = createContext<Toast[]>([])

export function useToast(): ToastApi {
  const api = useContext(ToastApiContext)
  if (!api) throw new Error('useToast must be used within ToastProvider')
  return api
}

const AUTO_DISMISS_MS = 4000
const MAX_VISIBLE = 3

const TONE_STYLE: Record<Tone, { bar: string; ring: string }> = {
  success: { bar: 'bg-status', ring: 'border-statusBorder' },
  error: { bar: 'bg-danger', ring: 'border-dangerBorder' },
  info: { bar: 'bg-accent', ring: 'border-accentBorder' }
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (tone: Tone, message: string, sticky?: boolean) => {
      const id = nextId.current++
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, tone, message, sticky }])
      if (!sticky) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
        )
      }
    },
    [dismiss]
  )

  // Stable API object — consumers never re-render on toast state changes.
  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message, opts) => push('error', message, opts?.sticky ?? true),
      info: (message) => push('info', message)
    }),
    [push]
  )

  // Clear timers on unmount.
  useEffect(() => {
    const map = timers.current
    return () => map.forEach((timer) => window.clearTimeout(timer))
  }, [])

  return (
    <ToastApiContext.Provider value={api}>
      {children}
      <ToastListContext.Provider value={toasts}>
        <ToastViewport onDismiss={dismiss} />
      </ToastListContext.Provider>
    </ToastApiContext.Provider>
  )
}

function ToastViewport({ onDismiss }: { onDismiss: (id: number) => void }): React.JSX.Element | null {
  const { t } = useI18n()
  const toasts = useContext(ToastListContext)
  // The live region stays mounted permanently — content inserted together with
  // its aria-live container is often missed by screen readers.
  return createPortal(
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-200 flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => {
        const style = TONE_STYLE[toast.tone]
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            // solid-surface: gradient themes make bg-panel translucent + frosted,
            // which washes toast text out over a busy terminal (same fix the
            // modals/menus already carry).
            className={`solid-surface flex items-start gap-2.5 overflow-hidden rounded-lg border bg-panel py-2.5 pl-0 pr-2 shadow-xl ${style.ring}`}
          >
            <span className={`w-1 self-stretch ${style.bar}`} aria-hidden />
            <span className="min-w-0 flex-1 wrap-break-word py-0.5 text-sm text-fg">
              {toast.message}
            </span>
            <button
              onClick={() => onDismiss(toast.id)}
              aria-label={t('common.dismiss')}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <CloseIcon size={12} />
            </button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
