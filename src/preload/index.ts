import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentDataEvent,
  type AgentExitEvent,
  type AgentSession,
  type AppSettings,
  type BranchInfo,
  type CustomMemoryMutationResult,
  type CustomMemoryPreset,
  type CustomMemoryProvider,
  type FileReadOptions,
  type FileReadResult,
  type FsListResult,
  type GitDiff,
  type GitStatus,
  type Language,
  type LayoutsState,
  type PresetsState,
  type ShortcutMap,
  type StartAgentArgs,
  type StartAgentResult,
  type TerminalPreset,
  type ThemeMode,
  type UiState,
  type WorkspaceLayout,
  type WorkspaceState,
  type WorktreeAddArgs,
  type WorktreeAddResult
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

  removeWorkspace(id: string, force = false): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_REMOVE, { id, force })
  },

  setActiveWorkspace(id: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.WORKSPACE_SET_ACTIVE, id)
  },

  /** Local branches in a folder, for the worktree-create picker. */
  listBranches(folderPath: string): Promise<BranchInfo[]> {
    return ipcRenderer.invoke(IPC.WORKTREE_LIST_BRANCHES, folderPath)
  },

  /** Create a git worktree + a workspace bound to it. */
  addWorktreeWorkspace(args: WorktreeAddArgs): Promise<WorktreeAddResult> {
    return ipcRenderer.invoke(IPC.WORKSPACE_ADD_WORKTREE, args)
  },

  /** True if a worktree has uncommitted changes (gate before a forced remove). */
  isWorktreeDirty(worktreePath: string): Promise<boolean> {
    return ipcRenderer.invoke(IPC.WORKTREE_IS_DIRTY, worktreePath)
  },

  getGitStatus(folderPath: string): Promise<GitStatus> {
    return ipcRenderer.invoke(IPC.GIT_STATUS, folderPath)
  },

  initGit(folderPath: string): Promise<GitStatus> {
    return ipcRenderer.invoke(IPC.GIT_INIT, folderPath)
  },

  getGitDiff(folderPath: string): Promise<GitDiff> {
    return ipcRenderer.invoke(IPC.GIT_DIFF, folderPath)
  },

  listDir(dirPath: string): Promise<FsListResult> {
    return ipcRenderer.invoke(IPC.FS_LIST_DIR, dirPath)
  },

  searchFiles(rootPath: string, query: string): Promise<FsListResult> {
    return ipcRenderer.invoke(IPC.FS_SEARCH, rootPath, query)
  },

  readFile(filePath: string, opts: FileReadOptions): Promise<FileReadResult> {
    return ipcRenderer.invoke(IPC.FS_READ_FILE, filePath, opts)
  },

  openPath(filePath: string): Promise<string> {
    return ipcRenderer.invoke(IPC.SHELL_OPEN_PATH, filePath)
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

  setUiState(ui: UiState): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET_UI, ui)
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

  listCustomMemoryPresets(): Promise<CustomMemoryPreset[]> {
    return ipcRenderer.invoke(IPC.CUSTOM_MEMORY_LIST)
  },

  createCustomMemoryPreset(
    provider: CustomMemoryProvider,
    name: string
  ): Promise<CustomMemoryMutationResult> {
    return ipcRenderer.invoke(IPC.CUSTOM_MEMORY_CREATE, { provider, name })
  },

  addCustomMemoryAlias(directoryName: string): Promise<CustomMemoryPreset[]> {
    return ipcRenderer.invoke(IPC.CUSTOM_MEMORY_ADD_ALIAS, directoryName)
  },

  addCustomMemoryTerminalPreset(
    directoryName: string
  ): Promise<CustomMemoryMutationResult> {
    return ipcRenderer.invoke(IPC.CUSTOM_MEMORY_ADD_TERMINAL_PRESET, directoryName)
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
