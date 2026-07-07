import { useEffect, useMemo, useRef } from 'react'

/**
 * Module-level stack of currently open overlays (modals, menus, popovers).
 *
 * Every layered surface registers itself on mount and asks `isTopOverlay`
 * before reacting to Escape, so closing a confirm dialog never also closes the
 * modal underneath it — `stopPropagation()` can't provide that guarantee when
 * both listeners sit on the same `window` target. The global shortcut
 * dispatcher also consults `overlayCount()` to keep destructive/focus-stealing
 * chords from firing behind an open overlay.
 */
let stack: symbol[] = []

export function pushOverlay(): symbol {
  const id = Symbol('overlay')
  stack.push(id)
  return id
}

export function popOverlay(id: symbol): void {
  stack = stack.filter((s) => s !== id)
}

export function isTopOverlay(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id
}

export function overlayCount(): number {
  return stack.length
}

/**
 * Register the calling component as an overlay for its lifetime. Returns a
 * stable `isTop` so event handlers can check whether they're the frontmost
 * layer (the only one that should respond to Escape).
 */
export function useOverlayLayer(): { isTop: () => boolean } {
  const idRef = useRef<symbol | null>(null)
  if (idRef.current === null) idRef.current = pushOverlay()
  useEffect(() => {
    // Re-register on a real remount (StrictMode unmounts pop the first id).
    if (idRef.current === null) idRef.current = pushOverlay()
    return () => {
      if (idRef.current !== null) popOverlay(idRef.current)
      idRef.current = null
    }
  }, [])
  // Stable identity so effects depending on the layer never re-subscribe.
  return useMemo(
    () => ({
      isTop: () => (idRef.current !== null ? isTopOverlay(idRef.current) : false)
    }),
    []
  )
}
