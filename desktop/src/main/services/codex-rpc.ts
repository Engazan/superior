import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
export type RpcRecord = Record<string, unknown>
/** JSONL transport with bounded frames, request deadlines and no implicit retries. */
export class CodexRpc {
  private child: ChildProcessWithoutNullStreams
  private sequence = 0
  private buffer = ''
  private closed = false
  private pending = new Map<number, { resolve: (value: RpcRecord) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  constructor(cwd: string, private event: (message: RpcRecord) => void, private ended: (error: Error) => void) {
    const windows = process.platform === 'win32'
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ELECTRON_')))
    this.child = spawn(windows ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/sh',
      windows ? ['/d', '/s', '/c', 'codex app-server --listen stdio://'] : ['-l', '-c', 'exec codex app-server --listen stdio://'],
      { cwd, env, detached: !windows, windowsHide: true, stdio: 'pipe' })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (data: string) => this.receive(data))
    // Drain diagnostics without leaking credentials/configuration into the chat.
    this.child.stderr.resume()
    this.child.once('error', error => this.fail(error))
    this.child.once('exit', () => this.fail(new Error('Codex connection closed. Resume by sending a new message.')))
    this.child.stdin.on('error', error => this.fail(error))
  }
  private receive(data: string): void {
    this.buffer += data
    if (this.buffer.length > 8_000_000) { this.fail(new Error('Codex response exceeded the transport limit.')); return }
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1)
      if (!line.trim()) continue
      let message: RpcRecord
      try { message = JSON.parse(line) } catch { this.fail(new Error('Invalid Codex protocol response.')); return }
      if (!message || typeof message !== 'object') continue
      if (!message.method && typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (!pending) continue
        clearTimeout(pending.timer); this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(String((message.error as RpcRecord).message ?? 'Codex request failed.')))
        else pending.resolve((message.result ?? {}) as RpcRecord)
      } else {
        try { this.event(message) } catch (error) { this.fail(error as Error); return }
      }
    }
  }
  write(message: RpcRecord): void {
    if (this.closed) throw new Error('Codex connection is closed.')
    this.child.stdin.write(JSON.stringify(message) + '\n')
  }
  request(method: string, params: RpcRecord): Promise<RpcRecord> {
    if (this.closed) return Promise.reject(new Error('Codex connection is closed.'))
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Codex ${method} timed out; inspect the conversation before retrying.`)), 30_000)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ id, method, params })
    })
  }
  close(): void { this.fail(new Error('Chat interrupted.')) }
  private fail(error: Error): void {
    if (this.closed) return
    this.closed = true
    if (this.child.pid && process.platform !== 'win32') {
      try { process.kill(-this.child.pid, 'SIGTERM') } catch { this.child.kill() }
    } else if (this.child.pid) {
      const killer = spawn('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.on('error', () => this.child.kill())
    } else this.child.kill()
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
    this.ended(error)
  }
}
