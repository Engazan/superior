import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/terminalSettings'
import { decodeOsc52, installTerminalInteractions, isUsLayout, MAX_OSC52_BYTES, optionActsAsAlt } from './terminalInteractions'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('terminal clipboard protocol', () => {
  it('decodes Unicode writes and rejects queries, invalid targets, encodings and oversized payloads', () => {
    const encoded = Buffer.from('Ahoj 👋 š').toString('base64')
    expect(decodeOsc52(`c;${encoded}`)).toBe('Ahoj 👋 š')
    for (const data of ['c;?', 'p;' + encoded, 'c;%%%', 'missing separator', 'c;/w==', 'c;' + Buffer.alloc(MAX_OSC52_BYTES + 1).toString('base64')]) {
      expect(decodeOsc52(data)).toBeNull()
    }
  })
  it('never executes clipboard writes from replay, disabled settings, or queries', async () => {
    let parser!: (data: string) => boolean
    const disposed = vi.fn()
    const term = {
      parser: { registerOscHandler: (_: number, callback: typeof parser) => { parser = callback; return { dispose: disposed } } },
      onSelectionChange: () => ({ dispose: disposed }), attachCustomWheelEventHandler: vi.fn(), attachCustomKeyEventHandler: vi.fn()
    } as unknown as Terminal
    // Chromium exposes getLayoutMap without making keyboard an EventTarget.
    vi.stubGlobal('navigator', { keyboard: { getLayoutMap: vi.fn().mockResolvedValue(new Map()) } })
    vi.stubGlobal('window', new EventTarget())
    const settings = { ...DEFAULT_TERMINAL_SETTINGS }
    let replay = false
    const write = vi.fn().mockResolvedValue(true)
    const cleanup = installTerminalInteractions(term, {
      getSettings: () => settings, isReplay: () => replay, isMac: true,
      writeClipboard: write, copySelection: write, onClipboardError: vi.fn()
    })
    const payload = 'c;' + Buffer.from('copy me').toString('base64')
    parser(payload)
    settings.allowOsc52Clipboard = true; replay = true; parser(payload)
    replay = false; parser('c;?')
    expect(write).not.toHaveBeenCalled()
    parser(payload)
    expect(write).toHaveBeenCalledExactlyOnceWith('copy me')
    cleanup()
    expect(disposed).toHaveBeenCalledTimes(2)
  })
})

describe('international macOS keyboard policy', () => {
  it('preserves composing characters for non-US or unknown layouts', () => {
    expect(isUsLayout(new Map())).toBe(false)
    expect(optionActsAsAlt('auto', false, new Set(['AltLeft']))).toBe(false)
    const us = new Map(Object.entries({ KeyQ: 'q', KeyA: 'a', KeyY: 'y', BracketLeft: '[', BracketRight: ']', Backquote: '`' }))
    expect(isUsLayout(us)).toBe(true)
    expect(optionActsAsAlt('auto', true, new Set())).toBe(true)
    us.set('KeyY', 'z')
    expect(isUsLayout(us)).toBe(false)
  })
  it('reserves the other Option key for composing and handles explicit overrides', () => {
    expect(optionActsAsAlt('left', false, new Set(['AltLeft']))).toBe(true)
    expect(optionActsAsAlt('left', true, new Set(['AltRight']))).toBe(false)
    expect(optionActsAsAlt('right', false, new Set(['AltRight']))).toBe(true)
    expect(optionActsAsAlt('off', true, new Set(['AltLeft']))).toBe(false)
    expect(optionActsAsAlt('both', false, new Set())).toBe(true)
  })
})

describe('terminal selection and wheel routing', () => {
  it('copies only nonempty live selections and cancels pending copies on disposal', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('document', { hasFocus: () => true })
    let select!: () => void
    let text = 'selected text'
    const copy = vi.fn().mockResolvedValue(undefined)
    const settings = { ...DEFAULT_TERMINAL_SETTINGS, copyOnSelect: true }
    let replay = false
    const term = {
      parser: { registerOscHandler: () => ({ dispose: vi.fn() }) },
      onSelectionChange: (callback: () => void) => { select = callback; return { dispose: vi.fn() } },
      getSelection: () => text, attachCustomWheelEventHandler: vi.fn(), attachCustomKeyEventHandler: vi.fn()
    } as unknown as Terminal
    const dispose = installTerminalInteractions(term, { getSettings: () => settings, isReplay: () => replay,
      isMac: false, writeClipboard: copy, copySelection: copy, onClipboardError: vi.fn() })
    select(); vi.runAllTimers()
    expect(copy).toHaveBeenCalledExactlyOnceWith('selected text')
    replay = true; select(); vi.runAllTimers()
    replay = false; text = ''; select(); vi.runAllTimers()
    text = 'new'; select(); settings.copyOnSelect = false; vi.runAllTimers()
    settings.copyOnSelect = true; select(); dispose(); vi.runAllTimers()
    expect(copy).toHaveBeenCalledOnce()
  })
  it('amplifies TUI wheel input without recursive reports or changing normal scrollback', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', new EventTarget())
    class TestWheel {
      deltaY = 1
      ctrlKey = false
      constructor(type: string, init?: object) { Object.assign(this, { type }, init) }
    }
    vi.stubGlobal('WheelEvent', TestWheel)
    let wheel!: (event: WheelEvent) => boolean
    const settings = { ...DEFAULT_TERMINAL_SETTINGS, tuiScrollSensitivity: 3 }
    const mode = { mouseTrackingMode: 'none' }
    const buffer = { active: { type: 'normal' } }
    const reports = vi.fn()
    const dispatch = (event: WheelEvent): void => { if (wheel(event)) reports() }
    const term = {
      parser: { registerOscHandler: () => ({ dispose: vi.fn() }) }, onSelectionChange: () => ({ dispose: vi.fn() }),
      attachCustomWheelEventHandler: (callback: typeof wheel) => { wheel = callback }, attachCustomKeyEventHandler: vi.fn(),
      element: { dispatchEvent: dispatch }, modes: mode, buffer
    } as unknown as Terminal
    const dispose = installTerminalInteractions(term, { getSettings: () => settings, isReplay: () => false,
      isMac: false, writeClipboard: vi.fn(), copySelection: vi.fn(), onClipboardError: vi.fn() })
    dispatch(new TestWheel('wheel') as unknown as WheelEvent)
    expect(reports).toHaveBeenCalledTimes(1)
    mode.mouseTrackingMode = 'vt200'
    dispatch(new TestWheel('wheel') as unknown as WheelEvent)
    expect(reports).toHaveBeenCalledTimes(4)
    mode.mouseTrackingMode = 'none'; buffer.active.type = 'alternate'
    dispatch(new TestWheel('wheel') as unknown as WheelEvent)
    expect(reports).toHaveBeenCalledTimes(7)
    dispatch(new TestWheel('wheel', { ctrlKey: true }) as unknown as WheelEvent)
    expect(reports).toHaveBeenCalledTimes(8)
    dispose()
  })
})
