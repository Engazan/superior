import { describe, expect, it } from 'vitest'
import { TerminalSignals } from './terminalSignals'

describe('explicit terminal signals', () => {
  it.each(['\x07', '\x1b]9;Task complete\x07', '\x1b]777;notify;Claude;Approval needed\x1b\\']) (
    'recognizes an attention request across every chunk boundary: %j', (sequence) => {
      for (let split = 0; split <= sequence.length; split++) {
        const parser = new TerminalSignals()
        const results = [parser.read(sequence.slice(0, split)), parser.read(sequence.slice(split))]
        expect(results.filter(Boolean)).toHaveLength(1)
      }
    }
  )

  it.each([
    'PS C:\\project> ', 'Task complete', '\x1b[2K\r',
    '\x1b]9;4;0\x07', '\x1b]9;4;1;50\x07', '\x1b]9;9;C:\\project\x07',
    '\x1b]0;Window title\x07', '\x1b]8;;https://example.com\x07',
    '\x1b]52;c;payload\x07', '\x1b]777;other;message\x07', '\x1b]9;\x07',
    '\x1bPignored\x07\x1b]9;embedded notification\x07\x1b\\',
    '\x1b_hidden\x07\x1b\\'
  ])('ignores ordinary text, progress and other control strings: %j', (sequence) => {
    const parser = new TerminalSignals()
    for (const char of sequence) expect(parser.read(char)).toBe(false)
    expect(parser.read('\x07')).toBe(true)
  })

  it('bounds an oversized or malformed OSC and recovers for the next request', () => {
    const parser = new TerminalSignals()
    expect(parser.read('\x1b]9;' + 'x'.repeat(20_000) + '\x07')).toBe(false)
    expect(parser.read('\x1b]9;bad\x1bx\x07')).toBe(false)
    expect(parser.read('\x1b]9;valid\x07')).toBe(true)
  })

  it('handles C1 OSC/ST and canceled sequences', () => {
    const parser = new TerminalSignals()
    expect(parser.read('\x9d9;Attention\x9c')).toBe(true)
    expect(parser.read('\x1b]9;aborted\x18')).toBe(false)
    expect(parser.read('ordinary text')).toBe(false)
  })
})
