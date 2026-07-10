import { describe, expect, it } from 'vitest'
import {
  FrameDecoder,
  daemonSocketPath,
  encodeDataFrame,
  encodeFrame,
  type ServerMessage
} from './daemon-protocol'

describe('frame codec', () => {
  it('round-trips JSON control frames', () => {
    const dec = new FrameDecoder<ServerMessage>()
    const msg: ServerMessage = { t: 'exit', id: 'abc', exitCode: 127 }
    expect(dec.push(encodeFrame(msg))).toEqual([msg])
  })

  it('round-trips binary data frames, including the replay flag', () => {
    const dec = new FrameDecoder<ServerMessage>()
    const wild = 'output \x1b[31mred\x00\xff á 🚀\n'
    const [live, replay] = dec.push(
      Buffer.concat([encodeDataFrame('s1', wild), encodeDataFrame('s1', 'snap', true)])
    )
    expect(live).toEqual({ t: 'data', id: 's1', data: wild })
    expect(replay).toEqual({ t: 'data', id: 's1', data: 'snap', replay: true })
  })

  it('reassembles frames split at arbitrary byte boundaries', () => {
    const msgs: ServerMessage[] = [
      { t: 'spawned', id: 'a', pid: 1 },
      { t: 'data', id: 'a', data: 'x'.repeat(1000) },
      { t: 'exit', id: 'a', exitCode: 0 }
    ]
    const wire = Buffer.concat([
      encodeFrame(msgs[0]),
      encodeDataFrame('a', 'x'.repeat(1000)),
      encodeFrame(msgs[2])
    ])
    // Feed the stream one byte at a time — the harshest segmentation.
    const dec = new FrameDecoder<ServerMessage>()
    const out: ServerMessage[] = []
    for (const byte of wire) out.push(...dec.push(Buffer.from([byte])))
    expect(out).toEqual(msgs)
  })
})

describe('daemonSocketPath', () => {
  it('derives distinct names for distinct userData paths', () => {
    // On win32 this is the pipe-name hash; elsewhere the paths differ trivially.
    const a = daemonSocketPath('C:\\Users\\alice\\AppData\\Roaming\\Superior')
    const b = daemonSocketPath('C:\\Users\\bob\\AppData\\Roaming\\Superior')
    expect(a).not.toBe(b)
    expect(daemonSocketPath('C:\\Users\\alice\\AppData\\Roaming\\Superior')).toBe(a)
  })
})
