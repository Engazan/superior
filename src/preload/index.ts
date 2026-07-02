import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AgentDataEvent,
  type AgentExitEvent,
  type AgentSession,
  type AgentUsage,
  type AppSettings,
  type BranchInfo,
  type BranchSwitchResult,
  type CliToolFixResult,
  type CliToolId,
  type CliToolStatus,
  type CloneArgs,
  type CloneResult,
  type Integration,
  type IntegrationDraft,
  type IntegrationsState,
  type IntegrationTestResult,
  type RepoListResult,
  type CustomMemoryMutationResult,
  type CustomMemoryPreset,
  type CustomMemoryProvider,
  type FileReadOptions,
  type FileReadResult,
  type FileWriteResult,
  type FolderUpdate,
  type ProfileUpdate,
  type FsListResult,
  type GitDiff,
  type GitStatus,
  type Language,
  type TabsState,
  type PresetsState,
  type ShellCommandInstallResult,
  type ShellCommandStatus,
  type ShortcutMap,
  type StartAgentArgs,
  type StartAgentResult,
  type TerminalPreset,
  type ThemeMode,
  type UiState,
  type UsagePrimary,
  type UpdateInfo,
  type UpdateProgress,
  type WorkspaceTabs,
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

  /** Create a new (empty) profile and switch to it. */
  addProfile(name: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.PROFILE_ADD, name)
  },

  renameProfile(id: string, name: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.PROFILE_RENAME, { id, name })
  },

  /** Update a profile's accent color (tints the title bar + sidebar when active). */
  updateProfile(id: string, patch: ProfileUpdate): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.PROFILE_UPDATE, { id, patch })
  },

  /** Delete a profile and all of its folders/workspaces (never the last one). */
  removeProfile(id: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.PROFILE_REMOVE, id)
  },

  setActiveProfile(id: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.PROFILE_SET_ACTIVE, id)
  },

  addFolder(): Promise<WorkspaceState | null | { error: string }> {
    return ipcRenderer.invoke(IPC.FOLDER_ADD)
  },

  removeFolder(folderPath: string): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.FOLDER_REMOVE, folderPath)
  },

  /** Persist a new folder order (the sidebar's drag-to-reorder). */
  reorderFolders(orderedPaths: string[]): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.FOLDER_REORDER, orderedPaths)
  },

  /** Update a folder's display name / custom icon (its path stays fixed). */
  updateFolder(folderPath: string, patch: FolderUpdate): Promise<WorkspaceState> {
    return ipcRenderer.invoke(IPC.FOLDER_UPDATE, { folderPath, patch })
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

  /** Workspace state pushed by main (e.g. a folder opened via `superior .`). */
  onWorkspaceStateChanged(cb: (state: WorkspaceState) => void): () => void {
    const listener = (_e: unknown, state: WorkspaceState): void => cb(state)
    ipcRenderer.on(IPC.WORKSPACE_STATE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.WORKSPACE_STATE_CHANGED, listener)
  },

  /** Whether the `superior` shell command is installed and resolvable. */
  getShellCommandStatus(): Promise<ShellCommandStatus> {
    return ipcRenderer.invoke(IPC.SHELL_COMMAND_STATUS)
  },

  /** Install the `superior` shell command (and put it on PATH). */
  installShellCommand(): Promise<ShellCommandInstallResult> {
    return ipcRenderer.invoke(IPC.SHELL_COMMAND_INSTALL)
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

  /** Check out `branch` in `folderPath`. Pass `{ stash: true }` to retry past a dirty-tree conflict. */
  switchBranch(
    folderPath: string,
    branch: string,
    opts?: { stash?: boolean }
  ): Promise<BranchSwitchResult> {
    return ipcRenderer.invoke(IPC.GIT_SWITCH_BRANCH, { folderPath, branch, opts })
  },

  /** Create `branch` from the current HEAD and switch to it. */
  createBranch(folderPath: string, branch: string): Promise<BranchSwitchResult> {
    return ipcRenderer.invoke(IPC.GIT_CREATE_BRANCH, { folderPath, branch })
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

  /** Overwrite a previewed text file with edited content. */
  writeFile(filePath: string, content: string): Promise<FileWriteResult> {
    return ipcRenderer.invoke(IPC.FS_WRITE_FILE, filePath, content)
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

  setAttentionColor(color: string): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET_ATTENTION_COLOR, color)
  },

  /** Enable/disable live Claude usage in the terminal topbar. */
  setUsageTracking(enabled: boolean): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET_USAGE_TRACKING, enabled)
  },

  /** Choose which usage figure the topbar badge leads with. */
  setUsagePrimary(primary: UsagePrimary): Promise<AppSettings> {
    return ipcRenderer.invoke(IPC.SETTINGS_SET_USAGE_PRIMARY, primary)
  },

  checkForUpdates(): Promise<UpdateInfo> {
    return ipcRenderer.invoke(IPC.UPDATE_CHECK)
  },

  openReleasePage(url: string): Promise<void> {
    return ipcRenderer.invoke(IPC.UPDATE_OPEN, url)
  },

  /** Start downloading the latest update (progress arrives via onUpdateStatus). */
  downloadUpdate(): Promise<void> {
    return ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD)
  },

  /** Quit and install a downloaded update, relaunching afterwards. */
  installUpdate(): Promise<void> {
    return ipcRenderer.invoke(IPC.UPDATE_INSTALL)
  },

  /** Subscribe to update download/install progress. Returns an unsubscribe fn. */
  onUpdateStatus(cb: (status: UpdateProgress) => void): () => void {
    const listener = (_e: unknown, payload: UpdateProgress): void => cb(payload)
    ipcRenderer.on(IPC.UPDATE_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, listener)
  },

  /** Saved git-forge integrations (GitHub / GitLab / Gitea connections). */
  listIntegrations(): Promise<IntegrationsState> {
    return ipcRenderer.invoke(IPC.INTEGRATIONS_LIST)
  },

  /** Upsert an integration by id (a blank id creates a new one). */
  saveIntegration(integration: Integration): Promise<IntegrationsState> {
    return ipcRenderer.invoke(IPC.INTEGRATIONS_SAVE, integration)
  },

  deleteIntegration(id: string): Promise<IntegrationsState> {
    return ipcRenderer.invoke(IPC.INTEGRATIONS_DELETE, id)
  },

  /** Probe a (possibly unsaved) connection against the forge's API. */
  testIntegration(draft: IntegrationDraft): Promise<IntegrationTestResult> {
    return ipcRenderer.invoke(IPC.INTEGRATIONS_TEST, draft)
  },

  /** List repositories the integration's token can access. */
  listRepos(integrationId: string): Promise<RepoListResult> {
    return ipcRenderer.invoke(IPC.INTEGRATIONS_LIST_REPOS, integrationId)
  },

  /** Pick a destination dir, clone the repo there, and register it as a folder. */
  cloneRepository(args: CloneArgs): Promise<CloneResult> {
    return ipcRenderer.invoke(IPC.INTEGRATIONS_CLONE, args)
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

  /** Whether claude/codex are installed and resolvable in the app's terminal. */
  checkCliTools(force?: boolean): Promise<CliToolStatus[]> {
    return ipcRenderer.invoke(IPC.CLI_TOOLS_CHECK, force)
  },

  /** Auto-fix a CLI that's installed but not on the app shell's PATH. */
  fixCliTool(id: CliToolId): Promise<CliToolFixResult> {
    return ipcRenderer.invoke(IPC.CLI_TOOL_FIX, id)
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

  getTabs(): Promise<TabsState> {
    return ipcRenderer.invoke(IPC.TABS_GET)
  },

  setTabs(workspaceId: string, tabs: WorkspaceTabs): Promise<TabsState> {
    return ipcRenderer.invoke(IPC.TABS_SET, { workspaceId, tabs })
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
  },

  /** Current Claude usage snapshots, to prime the store on load. */
  getUsageSnapshots(): Promise<AgentUsage[]> {
    return ipcRenderer.invoke(IPC.AGENT_USAGE_GET)
  },

  /** Subscribe to live Claude token/cost usage. Returns an unsubscribe function. */
  onAgentUsage(cb: (usage: AgentUsage) => void): () => void {
    const listener = (_e: unknown, payload: AgentUsage): void => cb(payload)
    ipcRenderer.on(IPC.AGENT_USAGE, listener)
    return () => ipcRenderer.removeListener(IPC.AGENT_USAGE, listener)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
