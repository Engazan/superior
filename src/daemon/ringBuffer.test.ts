import { describe, expect, it } from 'vitest'
import { RingBuffer } from './ringBuffer'

describe('RingBuffer', () => {
  it('returns pushed data verbatim while under capacity', () => {
    const buf = new RingBuffer(100)
    buf.push('hello ')
    buf.push('world')
    expect(buf.snapshot()).toBe('hello world')
  })

  it('drops whole chunks from the front when over capacity', () => {
    const buf = new RingBuffer(10)
    buf.push('aaaa')
    buf.push('bbbb')
    buf.push('cccc') // 12 bytes total → 'aaaa' must go
    expect(buf.snapshot()).toBe('bbbbcccc')
  })

  it('always keeps the newest chunk, even one larger than the capacity', () => {
    const buf = new RingBuffer(4)
    buf.push('12345678')
    expect(buf.snapshot()).toBe('12345678')
    buf.push('x')
    expect(buf.snapshot()).toBe('x')
  })

  it('counts capacity in bytes, not UTF-16 units', () => {
    const buf = new RingBuffer(6)
    buf.push('áá') // 4 bytes
    buf.push('áá') // 8 bytes total → first chunk evicted
    expect(buf.snapshot()).toBe('áá')
  })

  it('stays correct across the compaction threshold', () => {
    const buf = new RingBuffer(8)
    // Enough single-byte chunks to trip the head>256 compaction repeatedly.
    for (let i = 0; i < 2000; i++) buf.push(String(i % 10))
    const snap = buf.snapshot()
    expect(snap.length).toBe(8)
    expect(snap).toBe('23456789') // …1992 % 10 … 1999 % 10
  })
})
