import * as pty from 'node-pty'

export interface SpawnOptions {
  id: string
  /** the command line to run inside the login shell, e.g. "claude" */
  command: string
  cwd: string
  cols?: number
  rows?: number
  onData: (data: string) => void
  onExit: (exitCode: number, signal?: number) => void
}

/**
 * Owns all node-pty processes, keyed by session id.
 *
 * Agents are launched through a *login* shell (`$SHELL -l -c <command>`) so the
 * user's profile is sourced and PATH entries like ~/.local/bin and nvm paths are
 * available — a Finder-launched Electron app does not inherit them otherwise.
 */
class TerminalService {
  private readonly procs = new Map<string, pty.IPty>()

  /**
   * Spawn a pty. Returns the OS pid on success.
   * Throws on failure (e.g. EACCES) so the caller can surface a friendly error.
   */
  spawn(opts: SpawnOptions): number {
    const shell = process.env.SHELL || '/bin/zsh'

    const proc = pty.spawn(shell, ['-l', '-c', opts.command], {
      name: 'xterm-color',
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      cwd: opts.cwd,
      env: process.env as Record<string, string>
    })

    this.procs.set(opts.id, proc)

    proc.onData((data) => opts.onData(data))
    proc.onExit(({ exitCode, signal }) => {
      this.procs.delete(opts.id)
      opts.onExit(exitCode, signal)
    })

    return proc.pid
  }

  write(id: string, data: string): void {
    this.procs.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const proc = this.procs.get(id)
    if (!proc) return
    try {
      proc.resize(Math.max(cols, 1), Math.max(rows, 1))
    } catch {
      /* resizing a process that just exited can throw — ignore */
    }
  }

  kill(id: string): void {
    const proc = this.procs.get(id)
    if (!proc) return
    try {
      proc.kill()
    } catch {
      /* already gone */
    }
  }

  killAll(): void {
    for (const id of [...this.procs.keys()]) this.kill(id)
  }
}

export const terminalService = new TerminalService()
