import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type AgentType, type StartAgentResult } from '@shared/types'
import { killAgent, startAgent } from '../services/agent.service'
import { terminalService } from '../services/terminal.service'

interface StartPayload {
  agent: AgentType
  workspacePath: string
  cols?: number
  rows?: number
}

export function registerAgentIpc(): void {
  ipcMain.handle(IPC.AGENT_START, (event, payload: StartPayload): StartAgentResult => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { error: 'No window available to attach the session.' }
    return startAgent(win, payload)
  })

  ipcMain.handle(IPC.AGENT_KILL, (_event, id: string): void => {
    killAgent(id)
  })

  ipcMain.on(IPC.AGENT_INPUT, (_event, payload: { id: string; data: string }) => {
    terminalService.write(payload.id, payload.data)
  })

  ipcMain.on(IPC.AGENT_RESIZE, (_event, payload: { id: string; cols: number; rows: number }) => {
    terminalService.resize(payload.id, payload.cols, payload.rows)
  })
}
