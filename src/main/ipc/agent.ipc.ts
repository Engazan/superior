import { ipcMain } from 'electron'
import {
  IPC,
  type AgentSession,
  type AgentUsage,
  type StartAgentArgs,
  type StartAgentResult
} from '@shared/types'
import {
  killAgent,
  resizeAgent,
  restoreSessions,
  startAgent,
  updateSessionNickname
} from '../services/agent.service'
import { daemonClient } from '../services/daemonClient'
import { getUsageSnapshots } from '../services/usage.service'
import { handle } from './handle'

export function registerAgentIpc(): void {
  handle(IPC.AGENT_START, (payload: StartAgentArgs): Promise<StartAgentResult> =>
    startAgent(payload)
  )

  handle(IPC.AGENT_RESTORE, (): Promise<AgentSession[]> => restoreSessions())

  handle(IPC.AGENT_USAGE_GET, (): AgentUsage[] => getUsageSnapshots())

  handle(IPC.AGENT_KILL, (id: string): void => {
    killAgent(id)
  })

  handle(
    IPC.AGENT_UPDATE_META,
    (payload: { id: string; nickname: string }): void => {
      updateSessionNickname(payload.id, payload.nickname)
    }
  )

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
    resizeAgent(payload.id, payload.cols, payload.rows)
  })
}
