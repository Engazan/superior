import { useEffect, type RefObject } from 'react'
import { isTopOverlay, popOverlay, pushOverlay } from '../../overlayStack'

interface Options {
  /** dismiss on mousedown outside `ref` (default true) */
  outside?: boolean
  /** dismiss on Escape (default true) */
  escape?: boolean
}

/**
 * Close a popover/dropdown on outside click and/or Escape while `active`.
 * Consolidates the effect previously copy-pasted in PresetMenu, ProfileSwitcher
 * and BranchSwitcher. While active, the popover is registered on the overlay
 * stack so Escape only dismisses the frontmost layer — a popover under a modal
 * ignores the modal's Escape.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  { outside = true, escape = true }: Options = {}
): void {
  useEffect(() => {
    if (!active) return
    const layerId = pushOverlay()
    const onDown = (e: MouseEvent): void => {
      if (outside && ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (escape && e.key === 'Escape' && isTopOverlay(layerId)) onDismiss()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      popOverlay(layerId)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [ref, active, onDismiss, outside, escape])
}
