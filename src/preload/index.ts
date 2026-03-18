import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentDataEvent,
  type AgentExitEvent,
  type AgentSession,
  type AppSettings,
  type Language,
  type LayoutsState,
  type PresetsState,
  type ShortcutMap,
  type StartAgentArgs,
  type StartAgentResult,
  type TerminalPreset,
  type ThemeMode,
  type WorkspaceLayout,
  type WorkspaceState
} from '@shared/types'

const api = {
  /** Host platform, e.g. 'darwin' | 'win32' | 'linux'. */
  platform: process.platform,

  listWorkspaces(): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_LIST)
  },

  addFolder(): Promise<WorkspaceState | null | { error: string }> {
    return ipcRenderer.invoke(IPC.FOLDER_ADD)
  },

  removeFolder(folderPath: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.FOLDER_REMOVE, folderPath)
  },

  addWorkspace(folderPath: string, name: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_ADD, { folderPath, name })
  },

  renameWorkspace(id: string, name: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_RENAME, { id, name })
  },

  removeWorkspace(id: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_REMOVE, id)
  },

  setActiveWorkspace(id: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_SET_ACTIVE, id)
  },

  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_GET)
  },

  setTheme(theme: ThemeMode): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET_THEME, theme)
  },

  setLanguage(language: Language): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET_LANGUAGE, language)
  },

  setShortcuts(shortcuts: ShortcutMap): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET_SHORTCUTS, shortcuts)
  },

  listPresets(): Promise<PresetsState> {
    return ipcRenderer.invoke(IPC.PRESETS_LIST)
  },

  savePreset(preset: TerminalPreset): Promise<PresetsState> {
    return ipcRenderer.invoke(IPC.PRESETS_SAVE, preset)
  },

  deletePreset(id: string): Promise<PresetsState> {
    return ipcRenderer.invoke(IPC.PRESETS_DELETE, id)
  },

  reorderPresets(orderedIds: string[]): Promise<PresetsState> {
    return ipcRenderer.invoke(IPC.PRESETS_REORDER, orderedIds)
  },

  setPresetActive(id: string, active: boolean): Promise<PresetsState> {
    return ipcRenderer.invoke(IPC.PRESETS_SET_ACTIVE, { id, active })
  },

  pickPresetImage(): Promise<{ dataUrl: string } | null> {
    return ipcRenderer.invoke(IPC.PRESETS_PICK_IMAGE)
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

  startAgent(args: StartAgentArgs): Promise<StartAgentResult> {
    return ipcRenderer.invoke(IPC.AGENT_START, args)
  },

  /** Surviving sessions from the daemon, to rebuild the UI on launch. */
  restoreSessions(): Promise<AgentSession[]> {
    return ipcRenderer.invoke(IPC.AGENT_RESTORE)
  },

  attach(id: string): void {
    ipcRenderer.send(IPC.AGENT_ATTACH, id)
  },

  detach(id: string): void {
    ipcRenderer.send(IPC.AGENT_DETACH, id)
  },

  getLayouts(): Promise<LayoutsState> {
    return ipcRenderer.invoke(IPC.LAYOUT_GET)
  },

  setLayout(workspaceId: string, layout: WorkspaceLayout): Promise<LayoutsState> {
    return ipcRenderer.invoke(IPC.LAYOUT_SET, { workspaceId, layout })
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
