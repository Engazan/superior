import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { IPC, type AgentSession, type StartAgentArgs, type StartAgentResult } from '@shared/types'
import { terminalService } from './terminal.service'
import { isValidWorkspaceDir } from './workspace.service'

/**
 * Validate, then spawn a preset's command inside the workspace via the terminal
 * service. Streams output/exit back to the renderer over IPC.
 */
export function startAgent(win: BrowserWindow, args: StartAgentArgs): StartAgentResult {
  const { command, label, workspacePath } = args

  if (!workspacePath) {
    return { error: 'No workspace selected. Open a folder first.' }
  }
  if (!isValidWorkspaceDir(workspacePath)) {
    return { error: 'Workspace folder is invalid or no longer exists.' }
  }
  if (!command.trim()) {
    return { error: 'This preset has no command to run.' }
  }

  const session: AgentSession = {
    id: randomUUID(),
    label,
    command,
    iconType: args.iconType,
    icon: args.icon,
    workspacePath,
    status: 'running',
    createdAt: Date.now()
  }

  // Friendly label for the binary name (first token of the command).
  const bin = command.trim().split(/\s+/)[0]

  try {
    const pid = terminalService.spawn({
      id: session.id,
      command,
      cwd: workspacePath,
      cols: args.cols,
      rows: args.rows,
      onData: (data) => {
        if (win.isDestroyed()) return
        win.webContents.send(IPC.AGENT_DATA, { id: session.id, data })
      },
      onExit: (exitCode) => {
        if (win.isDestroyed()) return
        // A login shell exits 127 when the command isn't found on PATH.
        const message =
          exitCode === 127
            ? `${bin}: command not found. Is it installed and on your PATH?`
            : undefined
        win.webContents.send(IPC.AGENT_EXIT, { id: session.id, exitCode, message })
      }
    })
    session.pid = pid
    return { session }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    let message = `Failed to start ${bin}: ${e.message}`
    if (e.code === 'EACCES') {
      message = `Permission denied launching ${bin}. Check the binary's permissions.`
    } else if (e.code === 'ENOENT') {
      message = `${bin}: command not found. Is it installed and on your PATH?`
    }
    return { error: message }
  }
}

export function killAgent(id: string): void {
  terminalService.kill(id)
}
