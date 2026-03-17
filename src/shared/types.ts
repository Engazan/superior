export type ThemeMode = 'light' | 'dark' | 'system'

export type Language = 'en' | 'sk' | 'cs' | 'pl' | 'hu'

export interface AppSettings {
  theme: ThemeMode
  language: Language
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
}

export interface PresetsState {
  presets: TerminalPreset[]
}

export interface Workspace {
  path: string
  /** basename of path */
  name: string
  lastOpenedAt: number
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
  workspacePath: string
  status: AgentStatus
  pid?: number
  exitCode?: number | null
  /** populated on spawn failure (ENOENT/EACCES/etc.) */
  error?: string
  createdAt: number
}

/** Payload for starting an agent session from a preset. */
export interface StartAgentArgs {
  command: string
  label: string
  iconType?: PresetIconType
  icon?: string
  workspacePath: string
  cols?: number
  rows?: number
}

/** The set of saved workspaces plus which one is currently active. */
export interface WorkspaceState {
  workspaces: Workspace[]
  activePath: string | null
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
  WORKSPACE_ADD: 'workspace:add',
  WORKSPACE_REMOVE: 'workspace:remove',
  WORKSPACE_SET_ACTIVE: 'workspace:set-active',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_THEME: 'settings:set-theme',
  SETTINGS_SET_LANGUAGE: 'settings:set-language',
  PRESETS_LIST: 'presets:list',
  PRESETS_SAVE: 'presets:save',
  PRESETS_DELETE: 'presets:delete',
  PRESETS_REORDER: 'presets:reorder',
  PRESETS_SET_ACTIVE: 'presets:set-active',
  PRESETS_PICK_IMAGE: 'presets:pick-image',
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
  AGENT_EXIT: 'agent:exit'
} as const
