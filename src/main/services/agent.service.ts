import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import {
  AGENT_COMMAND,
  IPC,
  type AgentSession,
  type AgentType,
  type StartAgentResult
} from '@shared/types'
import { terminalService } from './terminal.service'
import { isValidWorkspaceDir } from './workspace.service'

interface StartArgs {
  agent: AgentType
  workspacePath: string
  cols?: number
  rows?: number
}

/**
 * Validate, then spawn an agent CLI inside the workspace via the terminal service.
 * Streams output/exit back to the renderer over IPC.
 */
export function startAgent(win: BrowserWindow, args: StartArgs): StartAgentResult {
  const { agent, workspacePath } = args

  if (!workspacePath) {
    return { error: 'No workspace selected. Open a folder first.' }
  }
  if (!isValidWorkspaceDir(workspacePath)) {
    return { error: 'Workspace folder is invalid or no longer exists.' }
  }

  const command = AGENT_COMMAND[agent]
  const session: AgentSession = {
    id: randomUUID(),
    agent,
    workspacePath,
    status: 'running',
    createdAt: Date.now()
  }

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
            ? `${command}: command not found. Is the ${agent} CLI installed and on your PATH?`
            : undefined
        win.webContents.send(IPC.AGENT_EXIT, { id: session.id, exitCode, message })
      }
    })
    session.pid = pid
    return { session }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    let message = `Failed to start ${command}: ${e.message}`
    if (e.code === 'EACCES') {
      message = `Permission denied launching ${command}. Check the binary's permissions.`
    } else if (e.code === 'ENOENT') {
      message = `${command}: command not found. Is the ${agent} CLI installed and on your PATH?`
    }
    return { error: message }
  }
}

export function killAgent(id: string): void {
  terminalService.kill(id)
}
