import { describe, expect, it, vi } from 'vitest'
import { activateTerminalUrl } from './terminalUrl'

describe('terminal browser links', () => {
  it.each(['ctrlKey', 'metaKey'] as const)('follows HTTP URLs with %s', (key) => {
    const open = vi.fn()
    const event = { ctrlKey: false, metaKey: false, preventDefault: vi.fn(), [key]: true }
    activateTerminalUrl(event, 'http://localhost:5173/page?q=hello#section', open)
    expect(open).toHaveBeenCalledWith('http://localhost:5173/page?q=hello#section')
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })
  it('keeps ordinary clicks available for terminal selection', () => {
    const open = vi.fn()
    const event = { ctrlKey: false, metaKey: false, preventDefault: vi.fn() }
    activateTerminalUrl(event, 'https://example.com', open)
    expect(open).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
  it.each(['javascript:alert(1)', 'file:///tmp/test', 'https://user:pass@example.com', 'http://', 'localhost:3000'])(
    'ignores unsupported or invalid links: %s', (url) => {
      const open = vi.fn()
      activateTerminalUrl({ ctrlKey: true, metaKey: false, preventDefault: vi.fn() }, url, open)
      expect(open).not.toHaveBeenCalled()
    }
  )
})
