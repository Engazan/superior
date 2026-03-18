import { ipcMain } from 'electron'
import { IPC, type AgentSession, type StartAgentArgs, type StartAgentResult } from '@shared/types'
import { killAgent, restoreSessions, startAgent } from '../services/agent.service'
import { daemonClient } from '../services/daemonClient'

export function registerAgentIpc(): void {
  ipcMain.handle(IPC.AGENT_START, (_event, payload: StartAgentArgs): Promise<StartAgentResult> =>
    startAgent(payload)
  )

  ipcMain.handle(IPC.AGENT_RESTORE, (): Promise<AgentSession[]> => restoreSessions())

  ipcMain.handle(IPC.AGENT_KILL, (_event, id: string): void => {
    killAgent(id)
  })

  ipcMain.on(IPC.AGENT_ATTACH, (_event, id: string) => {
    daemonClient.attach(id)
  })

  ipcMain.on(IPC.AGENT_DETACH, (_event, id: string) => {
    daemonClient.detach(id)
  })

  ipcMain.on(IPC.AGENT_INPUT, (_event, payload: { id: string; data: string }) => {
    daemonClient.input(payload.id, payload.data)
  })

  ipcMain.on(IPC.AGENT_RESIZE, (_event, payload: { id: string; cols: number; rows: number }) => {
    daemonClient.resize(payload.id, payload.cols, payload.rows)
  })
}
