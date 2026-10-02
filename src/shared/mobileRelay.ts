export interface MobileRelayStatus {
  enabled: boolean
  connected: boolean
  url: string
  hostId: string
  error?: string
  devices: { id: string; createdAt: number; paired: boolean }[]
}

export interface MobileRelayInvite {
  deviceId: string
  expiresAt: number
  /** Contains a secret: only show locally on the owner's screen. */
  pairing: string
}

/** Mobile DTOs intentionally omit credentials, preset commands and account paths. */
export interface MobileProfile {
  id: string
  name: string
  color?: string
}
export interface MobileProject {
  path: string
  profileId: string
  name: string
  color?: string
  kind: 'local' | 'remote'
}
export interface MobileWorkspace {
  id: string
  folderPath: string
  name: string
  branch?: string
  worktree: boolean
  setup?: 'pending' | 'running' | 'ready' | 'failed'
}
export interface MobileSession {
  id: string
  workspaceId: string
  tabId?: string
  label: string
  nickname?: string
  cols: number
  rows: number
  createdAt: number
  status: string
  agentState: 'working' | 'waiting' | 'idle' | 'unknown'
}
export interface MobilePreset {
  id: string
  name: string
  color?: string
}
export interface MobileTab {
  id: string
  workspaceId: string
  name: string
}
export interface MobileUsage {
  id: string
  name: string
  provider: 'claude' | 'codex'
  status:
    | 'ready'
    | 'notSignedIn'
    | 'expired'
    | 'unavailable'
    | 'rateLimited'
    | 'noData'
  plan: string | null
  windows: {
    id: string
    label: string
    usedPercent: number
    resetsAt: number | null
  }[]
  updatedAt: number
  resetCredits?: { availableCount: number } | null
}
export interface MobileCatalog {
  profiles: MobileProfile[]
  projects: MobileProject[]
  workspaces: MobileWorkspace[]
  sessions: MobileSession[]
  presets: MobilePreset[]
  tabs: MobileTab[]
}
export type CatalogRow = {
  [K in keyof MobileCatalog]: { kind: K; value: MobileCatalog[K][number] }
}[keyof MobileCatalog]
export interface MobileCapabilities {
  protocol: 2
  desktopVersion: string
  hostName: string
  actions: string[]
}
export interface MobileOperation {
  requestId: string
  state: 'running' | 'done' | 'failed' | 'uncertain'
  startedAt: number
  result?: { sessionId?: string }
  code?: string
}
export type MobileMutation =
  | { type: 'profiles.create'; name: string }
  | { type: 'profiles.rename'; id: string; name: string }
  | { type: 'profiles.color'; id: string; color: string | null }
  | { type: 'profiles.remove'; id: string; confirmed: true; force?: boolean }
  | { type: 'projects.add'; profileId: string; path: string }
  | {
      type: 'projects.update'
      path: string
      name?: string
      color?: string | null
    }
  | { type: 'projects.remove'; path: string; confirmed: true; force?: boolean }
  | { type: 'workspaces.create'; path: string; name: string }
  | { type: 'workspaces.rename'; id: string; name: string }
  | { type: 'workspaces.remove'; id: string; confirmed: true; force?: boolean }
  | {
      type: 'worktrees.create'
      path: string
      name: string
      branch: string
      createBranch: boolean
    }
  | {
      type: 'terminals.create'
      workspaceId: string
      presetId: string
      tabId?: string
    }
  | { type: 'terminals.kill'; sessionId: string; confirmed: true }
export const MOBILE_ACTIONS = [
  'catalog.get',
  'usage.get',
  'branches.list',
  'removal.preview',
  'operations.get',
  'profiles.create',
  'profiles.rename',
  'profiles.color',
  'profiles.remove',
  'projects.add',
  'projects.update',
  'projects.remove',
  'workspaces.create',
  'workspaces.rename',
  'workspaces.remove',
  'worktrees.create',
  'terminals.create',
  'terminals.kill',
] as const
export const emptyMobileCatalog = (): MobileCatalog => ({
  profiles: [],
  projects: [],
  workspaces: [],
  sessions: [],
  presets: [],
  tabs: [],
})
export const DEFAULT_MOBILE_RELAY = 'wss://superior-relay.engazan.eu'
