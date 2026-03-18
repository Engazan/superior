export type ThemeMode = 'light' | 'dark' | 'system'

export type Language = 'en' | 'sk' | 'cs' | 'pl' | 'hu'

/** Configurable, rebindable keyboard shortcut actions. */
export type ShortcutAction =
  | 'toggleSidebar'
  | 'openSettings'
  | 'maximizeFocusedCell'
  | 'openLauncher'

/**
 * A chord stored in a platform-neutral, normalized form: lowercase tokens
 * joined by '+', e.g. 'mod+b' or 'mod+,'. 'mod' resolves to ⌘ on macOS and
 * Ctrl elsewhere.
 */
export type ShortcutMap = Record<ShortcutAction, string>

export interface AppSettings {
  theme: ThemeMode
  language: Language
  shortcuts: ShortcutMap
}

export type PresetIconType = 'emoji' | 'image'

/** A user-defined terminal preset — a named command with an icon. */
export interface TerminalPreset {
  id: string
  name: string
  description: string
  command: string
  iconType: PresetIconType
  /** emoji character, or an image data URL when iconType === 'image' */
  icon: string
  /** active presets are shown as launch buttons in place of the defaults */
  active: boolean
  /** Stable link to a managed custom-memory preset, e.g. "claude:work". */
  customMemoryId?: string
}

export interface PresetsState {
  presets: TerminalPreset[]
}

export type CustomMemoryProvider = 'claude'

/** A provider-specific config directory discovered in the user's home folder. */
export interface CustomMemoryPreset {
  id: string
  provider: CustomMemoryProvider
  name: string
  directoryName: string
  directoryPath: string
  aliasName: string
  aliasCommand: string
  aliasExists: boolean
  aliasFiles: string[]
  terminalPresetExists: boolean
}

export interface CustomMemoryMutationResult {
  memories: CustomMemoryPreset[]
  presets: PresetsState
}

/** A project folder (cwd for its workspaces' terminals). */
export interface Folder {
  path: string
  /** basename of path */
  name: string
  lastOpenedAt: number
}

/** A named working context inside a folder, owning its own terminals + layout. */
export interface Workspace {
  /** crypto.randomUUID() */
  id: string
  /** the folder this workspace belongs to (its terminals' cwd) */
  folderPath: string
  /** user-editable display name */
  name: string
  createdAt: number
}

export type AgentStatus = 'running' | 'exited' | 'error'

export interface AgentSession {
  /** crypto.randomUUID() */
  id: string
  /** display label (the preset name) */
  label: string
  /** the command run in the workspace */
  command: string
  iconType?: PresetIconType
  icon?: string
  /** the workspace this session belongs to */
  workspaceId: string
  status: AgentStatus
  pid?: number
  exitCode?: number | null
  /** populated on spawn failure (ENOENT/EACCES/etc.) */
  error?: string
  /** last known terminal size, persisted in the daemon for replay sizing */
  cols?: number
  rows?: number
  createdAt: number
}

export type LayoutMode = 'tabs' | 'grid'

/** Grid cell sizing — row heights + per-row column widths as fractions. */
export interface GridLayoutData {
  rows: number[]
  cols: number[][]
}

/** A workspace's persisted layout (tab strip vs grid + grid sizing). */
export interface WorkspaceLayout {
  mode: LayoutMode
  gridLayout?: GridLayoutData
}

/** Persisted per-workspace layouts, keyed by workspace id. */
export type LayoutsState = Record<string, WorkspaceLayout>

/** Payload for starting an agent session from a preset. */
export interface StartAgentArgs {
  command: string
  label: string
  iconType?: PresetIconType
  icon?: string
  /** working directory (the workspace's folder path) */
  cwd: string
  /** the workspace this session belongs to */
  workspaceId: string
  cols?: number
  rows?: number
}

/** Saved folders + their workspaces, plus which workspace is active. */
export interface WorkspaceState {
  folders: Folder[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}

/** Git state for the folder backing the active workspace. */
export interface GitStatus {
  isRepository: boolean
  /** Current branch, or a short commit id while HEAD is detached. */
  branch: string | null
  error?: string
}

/** Result returned from a start-agent request. */
export type StartAgentResult = { session: AgentSession } | { error: string }

/** main -> renderer data event payload */
export interface AgentDataEvent {
  id: string
  data: string
}

/** main -> renderer exit event payload */
export interface AgentExitEvent {
  id: string
  exitCode: number
  /** friendly, user-facing message printed in the terminal (e.g. command-not-found) */
  message?: string
}

/**
 * IPC channel name constants so main + preload share one source of truth.
 */
export const IPC = {
  WORKSPACE_LIST: 'workspace:list',
  FOLDER_ADD: 'folder:add',
  FOLDER_REMOVE: 'folder:remove',
  WORKSPACE_ADD: 'workspace:add',
  WORKSPACE_RENAME: 'workspace:rename',
  WORKSPACE_REMOVE: 'workspace:remove',
  WORKSPACE_SET_ACTIVE: 'workspace:set-active',
  GIT_STATUS: 'git:status',
  GIT_INIT: 'git:init',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_THEME: 'settings:set-theme',
  SETTINGS_SET_LANGUAGE: 'settings:set-language',
  SETTINGS_SET_SHORTCUTS: 'settings:set-shortcuts',
  PRESETS_LIST: 'presets:list',
  PRESETS_SAVE: 'presets:save',
  PRESETS_DELETE: 'presets:delete',
  PRESETS_REORDER: 'presets:reorder',
  PRESETS_SET_ACTIVE: 'presets:set-active',
  PRESETS_PICK_IMAGE: 'presets:pick-image',
  CUSTOM_MEMORY_LIST: 'custom-memory:list',
  CUSTOM_MEMORY_CREATE: 'custom-memory:create',
  CUSTOM_MEMORY_ADD_ALIAS: 'custom-memory:add-alias',
  CUSTOM_MEMORY_ADD_TERMINAL_PRESET: 'custom-memory:add-terminal-preset',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE_TOGGLE: 'window:maximize-toggle',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed',
  AGENT_START: 'agent:start',
  AGENT_INPUT: 'agent:input',
  AGENT_RESIZE: 'agent:resize',
  AGENT_KILL: 'agent:kill',
  AGENT_DATA: 'agent:data',
  AGENT_EXIT: 'agent:exit',
  AGENT_RESTORE: 'agent:restore',
  AGENT_ATTACH: 'agent:attach',
  AGENT_DETACH: 'agent:detach',
  LAYOUT_GET: 'layout:get',
  LAYOUT_SET: 'layout:set'
} as const
