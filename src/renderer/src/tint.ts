import type { CSSProperties } from 'react'

/** Parse a 3/6-digit hex (with or without '#') into an `r, g, b` triplet, or null. */
export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/**
 * Tinted-strip style for a toolbar/topbar: a subtle fill plus a saturated bottom
 * border. Used by the app title bar (active profile color) and each terminal's
 * own topbar/tab (the launching preset color). `strong` lifts the fill opacity
 * so an active surface reads brighter than an inactive one.
 */
export function barTint(
  color: string | null | undefined,
  strong = true
): CSSProperties | undefined {
  if (!color) return undefined
  const rgb = hexToRgb(color)
  if (!rgb) return undefined
  const [r, g, b] = rgb
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${strong ? 0.18 : 0.1})`,
    borderBottomColor: `rgba(${r}, ${g}, ${b}, 0.7)`
  }
}

/**
 * Tint for a full panel (the sidebar): a faint wash over the panel background
 * plus a saturated right border, so the active profile's color reads down the
 * whole rail without overpowering the content.
 */
export function panelTint(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined
  const rgb = hexToRgb(color)
  if (!rgb) return undefined
  const [r, g, b] = rgb
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.08)`,
    borderRightColor: `rgba(${r}, ${g}, ${b}, 0.5)`
  }
}
