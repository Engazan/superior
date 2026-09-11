import { describe, expect, it } from 'vitest'
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/terminalSettings'
import { terminalOptions, terminalPalette } from './terminalAppearance'

describe('terminal appearance application', () => {
  it('applies typography, cursor, contrast and scroll controls together', () => {
    const preferences = { ...DEFAULT_TERMINAL_SETTINGS, fontSize: 20, fontWeight: 500, fontWeightBold: 800,
      lineHeight: 1.4, cursorStyle: 'underline' as const, cursorBlink: false, minimumContrastRatio: 4.5,
      scrollback: 50_000, scrollSensitivity: 1.5, fastScrollSensitivity: 8 }
    expect(terminalOptions(preferences, 'dark')).toMatchObject({ fontSize: 20, fontWeight: 500, fontWeightBold: 800,
      lineHeight: 1.4, cursorStyle: 'underline', cursorBlink: false, minimumContrastRatio: 4.5,
      scrollback: 50_000, scrollSensitivity: 1.5, fastScrollSensitivity: 8 })
  })
  it('keeps the light and dark palettes independent and blends cursor opacity', () => {
    const preferences = { ...DEFAULT_TERMINAL_SETTINGS, darkTheme: 'dracula' as const, lightTheme: 'solarized' as const, cursorOpacity: 0.5 }
    expect(terminalPalette(preferences, 'dark')).toMatchObject({ background: '#282a36', cursor: '#f8f8f280' })
    expect(terminalPalette(preferences, 'light')).toMatchObject({ background: '#fdf6e3', cursor: '#586e7580' })
  })
})
