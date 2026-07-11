import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FrameDecoder,
  daemonSocketPath,
  encodeFrame,
  type ClientMessage,
  type ServerMessage
} from '@shared/daemon-protocol'

interface Harness {
  child: ChildProcess
  socket: net.Socket
  send(message: ClientMessage): void
  waitFor(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage>
}

const cleanup: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose()
})

async function connectWithRetry(socketPath: string): Promise<net.Socket> {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    try {
      return await new Promise<net.Socket>((resolve, reject) => {
        const socket = net.connect(socketPath)
        socket.once('connect', () => resolve(socket))
        socket.once('error', reject)
      })
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error('Timed out connecting to daemon test process.')
}

async function startHarness(): Promise<Harness> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-daemon-process-'))
  const socketPath = daemonSocketPath(tmp)
  const logPath = path.join(tmp, 'daemon.log')
  const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'))
  const child = spawn(
    process.execPath,
    [
      tsxCli,
      '--tsconfig',
      path.resolve('tsconfig.node.json'),
      path.resolve('src/daemon/index.ts'),
      socketPath,
      logPath
    ],
    { cwd: path.resolve('.'), stdio: 'ignore' }
  )
  cleanup.push(async () => {
    if (child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      child.kill()
      await Promise.race([
        exited,
        new Promise<void>((resolve) => setTimeout(resolve, 2_000))
      ])
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  const socket = await connectWithRetry(socketPath)
  cleanup.push(() => {
    socket.destroy()
  })
  const decoder = new FrameDecoder<ServerMessage>()
  const queued: ServerMessage[] = []
  const waiters: Array<{
    predicate: (message: ServerMessage) => boolean
    resolve: (message: ServerMessage) => void
  }> = []
  socket.on('data', (chunk) => {
    if (typeof chunk === 'string') throw new Error('Daemon test socket unexpectedly decoded data.')
    for (const message of decoder.push(chunk)) {
      const index = waiters.findIndex((waiter) => waiter.predicate(message))
      if (index >= 0) waiters.splice(index, 1)[0].resolve(message)
      else queued.push(message)
    }
  })

  return {
    child,
    socket,
    send: (message) => socket.write(encodeFrame(message)),
    waitFor(predicate) {
      const index = queued.findIndex(predicate)
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0])
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve }
        waiters.push(waiter)
        setTimeout(() => {
          const pending = waiters.indexOf(waiter)
          if (pending >= 0) waiters.splice(pending, 1)
          reject(new Error('Timed out waiting for daemon message.'))
        }, 8_000)
      })
    }
  }
}

describe('daemon process lifecycle', () => {
  it('spawns a PTY and acknowledges a kill before removing the session', async () => {
    const harness = await startHarness()
    const id = randomUUID()
    const requestId = randomUUID()
    harness.send({ t: 'hello' })
    harness.send({
      t: 'spawn',
      id,
      command: '',
      direct: {
        executable: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)']
      },
      cwd: os.tmpdir(),
      cols: 80,
      rows: 24,
      meta: {
        label: 'Test',
        command: '',
        cwd: os.tmpdir(),
        workspaceId: 'workspace-test',
        tabId: 'tab-test',
        createdAt: Date.now()
      }
    })

    await expect(harness.waitFor((message) => message.t === 'spawned' && message.id === id))
      .resolves.toMatchObject({ t: 'spawned', id })

    harness.send({ t: 'kill', id, requestId })
    await expect(
      harness.waitFor(
        (message) => message.t === 'killed' && message.id === id && message.requestId === requestId
      )
    ).resolves.toEqual({ t: 'killed', id, requestId })
    await expect(harness.waitFor((message) => message.t === 'exit' && message.id === id))
      .resolves.toMatchObject({ t: 'exit', id })

    harness.send({ t: 'list' })
    await expect(harness.waitFor((message) => message.t === 'sessions'))
      .resolves.toEqual({ t: 'sessions', list: [] })
  }, 20_000)
})
