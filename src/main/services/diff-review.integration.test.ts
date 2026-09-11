import { spawn, type ChildProcess } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { afterEach, expect, it, vi } from 'vitest'
import { daemonSocketPath } from '@shared/daemon-protocol'

const host = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => host.directory, getAppPath: () => process.cwd() },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('./usage.service', () => ({ stopUsageTracking: () => {} }))
import { daemonClient, shutdownDaemon } from './daemonClient'
import { sendReview } from './diff-review.service'

let child: ChildProcess | undefined
afterEach(async () => {
  await shutdownDaemon()
  daemonClient.disconnect()
  if (child && child.exitCode === null) child.kill()
  if (host.directory) rmSync(host.directory, { recursive: true, force: true })
})

it('delivers the complete review to a real PTY through the daemon transport', async () => {
  host.directory = mkdtempSync(join(tmpdir(), 'review-pty-'))
  const socket = daemonSocketPath(host.directory)
  child = spawn(process.execPath, [fileURLToPath(import.meta.resolve('tsx/cli')),
    '--tsconfig', resolve('tsconfig.node.json'), resolve('src/daemon/index.ts'), socket, join(host.directory, 'daemon.log')],
  { stdio: 'ignore' })
  await vi.waitFor(() => expect(existsSync(socket)).toBe(true), { timeout: 15_000 })
  const ready = join(host.directory, 'ready')
  const received = join(host.directory, 'received')
  const script = `const fs=require('fs'); process.stdin.setRawMode(true); process.stdin.resume(); let input=''; process.stdin.on('data', chunk=>{input+=chunk.toString();fs.writeFileSync(${JSON.stringify(received)},input)});fs.writeFileSync(${JSON.stringify(ready)},'ready')`
  const id = 'review-agent'
  await daemonClient.spawn({ id, command: 'review-fixture',
    direct: { executable: process.execPath, args: ['-e', script] }, cwd: host.directory, cols: 80, rows: 24,
    meta: { label: 'Review fixture', command: 'review-fixture', cwd: host.directory, workspaceId: 'review-workspace', createdAt: Date.now() } })
  await vi.waitFor(() => expect(existsSync(ready)).toBe(true), { timeout: 15_000 })
  const prompt = 'Review comment 1\nKeep the original behavior.\n\nReview comment 2\nPridaj test.'
  await sendReview({ sessionId: id, workspaceId: 'review-workspace', folderPath: host.directory, prompt })
  // ConPTY translates VT input into console input records for this Node fixture,
  // consuming the bracketed-paste delimiters. POSIX raw PTYs preserve them.
  // The service unit test separately checks the exact outgoing batch on every OS.
  const expected = process.platform === 'win32' ? `${prompt}\r` : `\x1b[200~${prompt}\x1b[201~\r`
  await vi.waitFor(() => expect(readFileSync(received, 'utf8')).toBe(expected), { timeout: 15_000 })
}, 40_000)
