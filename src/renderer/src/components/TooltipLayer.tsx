import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * A single app-wide tooltip that replaces the browser's native `title` bubbles
 * with a styled, themed one — without touching the hundreds of `title={…}`
 * call sites. It listens at the document level, and for any hovered/focused
 * element carrying a `title`, it temporarily blanks the attribute (to suppress
 * the OS tooltip), shows its own bubble after a short delay, and restores the
 * attribute on leave. Because it works off the live DOM, forwarded `title`
 * props and future call sites are covered for free.
 */

interface Tip {
  text: string
  /** Target center x and the edge (top/bottom) the bubble points at. */
  cx: number
  edgeY: number
  placement: 'top' | 'bottom'
}

const OPEN_DELAY = 350
const GAP = 8
const VIEWPORT_PAD = 6

export function TooltipLayer(): JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null)
  const [visible, setVisible] = useState(false)
  // Horizontal shift applied to keep the bubble inside the viewport; the arrow
  // is nudged back by the same amount so it keeps pointing at the target.
  const [shift, setShift] = useState(0)
  const bubbleRef = useRef<HTMLDivElement>(null)

  const timerRef = useRef<number | null>(null)
  const activeRef = useRef<HTMLElement | null>(null)
  const savedRef = useRef<string | null>(null)

  useEffect(() => {
    const clearTimer = (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    // Put the borrowed title back on the element we took it from.
    const restore = (): void => {
      const el = activeRef.current
      if (el && savedRef.current !== null) el.setAttribute('title', savedRef.current)
      activeRef.current = null
      savedRef.current = null
    }

    const hide = (): void => {
      clearTimer()
      restore()
      setTip(null)
      setVisible(false)
      setShift(0)
    }

    const open = (el: HTMLElement, text: string): void => {
      const r = el.getBoundingClientRect()
      // Prefer showing above the target unless it's too close to the top edge.
      const placement: Tip['placement'] = r.top > 56 ? 'top' : 'bottom'
      setTip({
        text,
        cx: r.left + r.width / 2,
        edgeY: placement === 'top' ? r.top - GAP : r.bottom + GAP,
        placement
      })
    }

    const arm = (el: HTMLElement): void => {
      const title = el.getAttribute('title')
      if (title === null || title.trim() === '') return
      hide()
      activeRef.current = el
      savedRef.current = title
      el.setAttribute('title', '') // suppress the native OS tooltip
      timerRef.current = window.setTimeout(() => open(el, title), OPEN_DELAY)
    }

    const onOver = (e: MouseEvent): void => {
      const el = (e.target as Element | null)?.closest?.('[title]') as HTMLElement | null
      if (!el || el === activeRef.current) return
      arm(el)
    }

    const onOut = (e: MouseEvent): void => {
      const el = activeRef.current
      if (!el) return
      const related = e.relatedTarget as Node | null
      if (related && el.contains(related)) return
      hide()
    }

    const onFocusIn = (e: FocusEvent): void => {
      const el = (e.target as Element | null)?.closest?.('[title]') as HTMLElement | null
      if (!el || el === activeRef.current) return
      arm(el)
    }

    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mouseout', onOut, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', hide, true)
    document.addEventListener('mousedown', hide, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)

    return () => {
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('mouseout', onOut, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', hide, true)
      document.removeEventListener('mousedown', hide, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
      hide()
    }
  }, [])

  // Once rendered, clamp inside the viewport and fade in.
  useLayoutEffect(() => {
    if (!tip || !bubbleRef.current) return
    const rect = bubbleRef.current.getBoundingClientRect()
    let next = 0
    if (rect.left < VIEWPORT_PAD) next = VIEWPORT_PAD - rect.left
    else if (rect.right > window.innerWidth - VIEWPORT_PAD)
      next = window.innerWidth - VIEWPORT_PAD - rect.right
    setShift(next)
    setVisible(true)
  }, [tip])

  if (!tip) return null

  const top = tip.placement === 'top'
  return (
    <div
      ref={bubbleRef}
      role="tooltip"
      className={`pointer-events-none fixed z-[100] max-w-[min(22rem,90vw)] rounded-md border border-edge bg-panel px-2 py-1 text-xs font-medium leading-snug text-fg shadow-xl transition-opacity duration-100 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: tip.cx + shift,
        top: tip.edgeY,
        transform: `translate(-50%, ${top ? '-100%' : '0'})`
      }}
    >
      {tip.text}
      <span
        className="absolute h-2 w-2 rotate-45 bg-panel"
        style={{
          left: `calc(50% - ${shift}px)`,
          marginLeft: -4,
          borderColor: 'var(--c-edge)',
          borderStyle: 'solid',
          ...(top
            ? { bottom: -4, borderRightWidth: 1, borderBottomWidth: 1 }
            : { top: -4, borderLeftWidth: 1, borderTopWidth: 1 })
        }}
      />
    </div>
  )
}
