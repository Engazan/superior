import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentDataEvent,
  type AgentExitEvent,
  type AgentType,
  type AppSettings,
  type StartAgentResult,
  type ThemeMode,
  type WorkspaceState
} from '@shared/types'

const api = {
  /** Host platform, e.g. 'darwin' | 'win32' | 'linux'. */
  platform: process.platform,

  listWorkspaces(): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_LIST)
  },

  addWorkspace(): Promise<WorkspaceState | null | { error: string }> {
    return ipcRenderer.invoke(IPC.WORKSPACE_ADD)
  },

  removeWorkspace(path: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_REMOVE, path)
  },

  setActiveWorkspace(path: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_SET_ACTIVE, path)
  },

  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_GET)
  },

  setTheme(theme: ThemeMode): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET_THEME, theme)
  },

  windowMinimize(): void {
    ipcRenderer.send(IPC.WINDOW_MINIMIZE)
  },

  windowToggleMaximize(): void {
    ipcRenderer.send(IPC.WINDOW_MAXIMIZE_TOGGLE)
  },

  windowClose(): void {
    ipcRenderer.send(IPC.WINDOW_CLOSE)
  },

  windowIsMaximized(): Promise<boolean> {
    return ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED)
  },

  /** Subscribe to maximize/restore changes. Returns an unsubscribe function. */
  onWindowMaximizedChange(cb: (maximized: boolean) => void): () => void {
    const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on(IPC.WINDOW_MAXIMIZED_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.WINDOW_MAXIMIZED_CHANGED, listener)
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
