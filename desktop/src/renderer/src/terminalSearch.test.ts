import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SearchAddon } from '@xterm/addon-search'
import type { Terminal } from '@xterm/xterm'
import {
  clearTerminalSearch,
  findInTerminal,
  focusTerminal,
  registerSearch,
  unregisterSearch
} from './terminalSearch'

const SESSION_ID = 'search-test'

function register(addon: Partial<SearchAddon>, terminal: Partial<Terminal> = {}): void {
  registerSearch(SESSION_ID, addon as SearchAddon, terminal as Terminal)
}

afterEach(() => {
  unregisterSearch(SESSION_ID)
  vi.restoreAllMocks()
})

describe('terminal search safety', () => {
  it('uses selection-only incremental search without unsafe decorations', () => {
    const findNext = vi.fn(() => true)
    register({ findNext })

    expect(findInTerminal(SESSION_ID, 'needle', 'next', { incremental: true })).toBe(true)
    expect(findNext).toHaveBeenCalledWith('needle', { incremental: true })
  })

  it('contains addon failures instead of taking down the renderer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    register({
      findPrevious: vi.fn(() => {
        throw new TypeError("Cannot read properties of undefined (reading 'line')")
      })
    })

    expect(() => findInTerminal(SESSION_ID, 'old scrollback', 'previous')).not.toThrow()
    expect(findInTerminal(SESSION_ID, 'old scrollback', 'previous')).toBe(false)
  })

  it('safely clears and restores focus while a terminal is being removed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    register(
      {
        clearDecorations: vi.fn(() => {
          throw new Error('disposed')
        })
      },
      {
        focus: vi.fn(() => {
          throw new Error('disposed')
        })
      }
    )

    expect(() => clearTerminalSearch(SESSION_ID)).not.toThrow()
    expect(() => focusTerminal(SESSION_ID)).not.toThrow()
  })
})
