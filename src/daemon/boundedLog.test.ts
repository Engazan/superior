import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { BoundedLog } from './boundedLog'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-bounded-log-'))
  dirs.push(dir)
  return path.join(dir, 'daemon.log')
}

describe('BoundedLog', () => {
  it('rotates during a long-running process and remains below its byte cap', () => {
    const file = tempFile()
    const log = new BoundedLog(file, 160)
    for (let i = 0; i < 100; i++) log.write(`message-${i}`)

    expect(fs.statSync(file).size).toBeLessThanOrEqual(160)
    expect(fs.readFileSync(file, 'utf8')).toContain('message-99')
  })

  it('truncates an oversized pre-existing log at startup', () => {
    const file = tempFile()
    fs.writeFileSync(file, Buffer.alloc(500, 1))
    const log = new BoundedLog(file, 100)
    expect(fs.statSync(file).size).toBe(0)
    log.write('healthy')
    expect(fs.statSync(file).size).toBeLessThanOrEqual(100)
  })

  it('bounds even a single oversized UTF-8 message', () => {
    const file = tempFile()
    new BoundedLog(file, 64).write('🚀'.repeat(100))
    expect(fs.statSync(file).size).toBe(64)
  })
})
