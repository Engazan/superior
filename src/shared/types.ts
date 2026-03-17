export type AgentType = 'claude' | 'codex'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppSettings {
  theme: ThemeMode
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
  agent: AgentType
  workspacePath: string
  status: AgentStatus
  pid?: number
  exitCode?: number | null
  /** populated on spawn failure (ENOENT/EACCES/etc.) */
  error?: string
  createdAt: number
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
  AGENT_START: 'agent:start',
  AGENT_INPUT: 'agent:input',
  AGENT_RESIZE: 'agent:resize',
  AGENT_KILL: 'agent:kill',
  AGENT_DATA: 'agent:data',
  AGENT_EXIT: 'agent:exit'
} as const

/** The label of the binary each agent type runs. */
export const AGENT_COMMAND: Record<AgentType, string> = {
  claude: 'claude',
  codex: 'codex'
}
