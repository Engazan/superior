import { describe, expect, it } from 'vitest'
import { DEFAULT_TERMINAL_SETTINGS, normalizeTerminalSettings } from './terminalSettings'

describe('terminal preferences at the persistence boundary', () => {
  it('migrates absent or corrupt preferences without changing existing defaults', () => {
    for (const raw of [null, undefined, [], 'broken', 42]) expect(normalizeTerminalSettings(raw)).toEqual(DEFAULT_TERMINAL_SETTINGS)
    expect(normalizeTerminalSettings({ fontSize: '22', fontFamily: '\x1b[31m', cursorStyle: 'bad', copyOnSelect: 'true' })).toEqual(DEFAULT_TERMINAL_SETTINGS)
  })
  it('bounds memory, rendering and input amplification independently', () => {
    expect(normalizeTerminalSettings({ scrollback: 1e10, fontSize: -1, lineHeight: Infinity, tuiScrollSensitivity: 999, cursorOpacity: 0 })).toMatchObject({
      scrollback: 100_000, fontSize: 8, lineHeight: 1, tuiScrollSensitivity: 10, cursorOpacity: 0.2
    })
  })
  it('merges partial updates and drops unrecognized properties', () => {
    const base = normalizeTerminalSettings({ fontSize: 18, darkTheme: 'dracula', allowOsc52Clipboard: true })
    const next = normalizeTerminalSettings({ cursorBlink: false, fontSize: NaN, unknown: true }, base)
    expect(next).toMatchObject({ fontSize: 18, darkTheme: 'dracula', cursorBlink: false, allowOsc52Clipboard: true })
    expect(next).not.toHaveProperty('unknown')
    expect(base.cursorBlink).toBe(true)
  })
})
