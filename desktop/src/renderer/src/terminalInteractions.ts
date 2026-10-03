import type { Terminal } from '@xterm/xterm'
import type { TerminalSettings } from '@shared/terminalSettings'

export const MAX_OSC52_BYTES = 100_000
/** Accept writes to the system clipboard; queries and other selections are not supported. */
export function decodeOsc52(data: string): string | null {
  const separator = data.indexOf(';')
  if (separator < 0) return null
  const target = data.slice(0, separator)
  const payload = data.slice(separator + 1)
  if (target !== '' && !/^[cs]+$/.test(target)) return null
  if (!payload || payload === '?' || payload.length > Math.ceil(MAX_OSC52_BYTES / 3) * 4) return null
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) return null
  try {
    const bytes = Uint8Array.from(atob(payload), c => c.charCodeAt(0))
    if (bytes.length > MAX_OSC52_BYTES) return null
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch { return null }
}
export function optionActsAsAlt(mode: TerminalSettings['macOptionAsAlt'], usLayout: boolean, sides: ReadonlySet<string>): boolean {
  if (mode === 'auto') return usLayout
  if (mode === 'both') return true
  if (mode === 'off') return false
  return sides.has(mode === 'left' ? 'AltLeft' : 'AltRight')
}
export function isUsLayout(map: { get: (key: string) => string | undefined }): boolean {
  return Object.entries({ KeyQ: 'q', KeyA: 'a', KeyY: 'y', BracketLeft: '[', BracketRight: ']', Backquote: '`' })
    .every(([key, value]) => map.get(key) === value)
}

export function installTerminalInteractions(term: Terminal, options: {
  getSettings: () => TerminalSettings
  isReplay: () => boolean
  isMac: boolean
  writeClipboard: (text: string) => Promise<unknown>
  copySelection: (text: string) => Promise<unknown>
  onClipboardError: () => void
}): () => void {
  const osc = term.parser.registerOscHandler(52, data => {
    if (!options.getSettings().allowOsc52Clipboard || options.isReplay()) return true
    const text = decodeOsc52(data)
    if (text !== null) void options.writeClipboard(text).catch(options.onClipboardError)
    return true
  })
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const selection = term.onSelectionChange(() => {
    clearTimeout(copyTimer)
    if (!options.getSettings().copyOnSelect || options.isReplay()) return
    copyTimer = setTimeout(() => {
      if (!options.getSettings().copyOnSelect || options.isReplay() || !document.hasFocus()) return
      const text = term.getSelection()
      if (text) void options.copySelection(text).catch(options.onClipboardError)
    }, 100)
  })
  const sides = new Set<string>()
  let usLayout = false
  let disposed = false
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>>; addEventListener?: EventTarget['addEventListener']; removeEventListener?: EventTarget['removeEventListener'] } }).keyboard
  const detectLayout = (): void => {
    usLayout = false
    void keyboard?.getLayoutMap?.().then(map => { if (!disposed) usLayout = isUsLayout(map) }).catch(() => {})
  }
  const keyDown = (event: KeyboardEvent): void => {
    if (event.code === 'AltLeft' || event.code === 'AltRight') sides.add(event.code)
  }
  const keyUp = (event: KeyboardEvent): void => { sides.delete(event.code) }
  const resetKeys = (): void => { sides.clear() }
  if (options.isMac) {
    detectLayout()
    keyboard?.addEventListener?.('layoutchange', detectLayout)
    window.addEventListener('focus', detectLayout)
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('keyup', keyUp, true)
    window.addEventListener('blur', resetKeys)
    term.attachCustomKeyEventHandler(event => {
      term.options.macOptionIsMeta = event.altKey && optionActsAsAlt(options.getSettings().macOptionAsAlt, usLayout, sides)
      return true
    })
  }
  // Let xterm encode mouse protocols and coordinates. Extra reports use its same
  // public wheel path; the WeakSet prevents recursive multiplication.
  const extraWheels = new WeakSet<WheelEvent>()
  term.attachCustomWheelEventHandler(event => {
    if (extraWheels.has(event) || event.ctrlKey || event.deltaY === 0) return true
    const tui = term.modes.mouseTrackingMode !== 'none' || term.buffer.active.type === 'alternate'
    if (!tui) return true
    const count = options.getSettings().tuiScrollSensitivity
    for (let i = 1; i < count; i++) {
      const extra = new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaMode: event.deltaMode, deltaX: event.deltaX, deltaY: event.deltaY,
        clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey,
        altKey: event.altKey, metaKey: event.metaKey
      })
      extraWheels.add(extra)
      term.element?.dispatchEvent(extra)
    }
    return true
  })
  return () => {
    disposed = true
    clearTimeout(copyTimer)
    osc.dispose(); selection.dispose()
    keyboard?.removeEventListener?.('layoutchange', detectLayout)
    window.removeEventListener('focus', detectLayout)
    window.removeEventListener('keydown', keyDown, true)
    window.removeEventListener('keyup', keyUp, true)
    window.removeEventListener('blur', resetKeys)
    term.attachCustomKeyEventHandler(() => true)
    term.attachCustomWheelEventHandler(() => true)
  }
}
