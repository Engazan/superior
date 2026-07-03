import { useEffect, type RefObject } from 'react'

interface Options {
  /** dismiss on mousedown outside `ref` (default true) */
  outside?: boolean
  /** dismiss on Escape (default true) */
  escape?: boolean
}

/**
 * Close a popover/dropdown on outside click and/or Escape while `active`.
 * Consolidates the effect previously copy-pasted in PresetMenu, ProfileSwitcher
 * and BranchSwitcher.
 */
export function useDismiss(
  ref: RefObject<HTMLElement>,
  active: boolean,
  onDismiss: () => void,
  { outside = true, escape = true }: Options = {}
): void {
  useEffect(() => {
    if (!active) return
    const onDown = (e: MouseEvent): void => {
      if (outside && ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (escape && e.key === 'Escape') onDismiss()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [ref, active, onDismiss, outside, escape])
}
