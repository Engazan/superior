import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentDataEvent,
  type AgentExitEvent,
  type AgentType,
  type StartAgentResult,
  type Workspace
} from '@shared/types'

const api = {
  openWorkspace(): Promise<{ workspace: Workspace | null } | { error: string }> {
    return ipcRenderer.invoke(IPC.WORKSPACE_OPEN)
  },

  getLastWorkspace(): Promise<Workspace | null> {
    return ipcRenderer.invoke(IPC.WORKSPACE_GET_LAST)
  },

  startAgent(
    agent: AgentType,
    workspacePath: string,
    cols?: number,
    rows?: number
  ): Promise<StartAgentResult> {
    return ipcRenderer.invoke(IPC.AGENT_START, { agent, workspacePath, cols, rows })
  },

  sendInput(id: string, data: string): void {
    ipcRenderer.send(IPC.AGENT_INPUT, { id, data })
  },

  resize(id: string, cols: number, rows: number): void {
    ipcRenderer.send(IPC.AGENT_RESIZE, { id, cols, rows })
  },

  killAgent(id: string): Promise<void> {
    return ipcRenderer.invoke(IPC.AGENT_KILL, id)
  },

  /** Subscribe to terminal output. Returns an unsubscribe function. */
  onAgentData(cb: (e: AgentDataEvent) => void): () => void {
    const listener = (_e: unknown, payload: AgentDataEvent): void => cb(payload)
    ipcRenderer.on(IPC.AGENT_DATA, listener)
    return () => ipcRenderer.removeListener(IPC.AGENT_DATA, listener)
  },

  /** Subscribe to process exit. Returns an unsubscribe function. */
  onAgentExit(cb: (e: AgentExitEvent) => void): () => void {
    const listener = (_e: unknown, payload: AgentExitEvent): void => cb(payload)
    ipcRenderer.on(IPC.AGENT_EXIT, listener)
    return () => ipcRenderer.removeListener(IPC.AGENT_EXIT, listener)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
