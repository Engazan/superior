export type ThemeMode = 'light' | 'dark' | 'system'

export type Language = 'en' | 'sk' | 'cs' | 'pl' | 'hu'

/** Configurable, rebindable keyboard shortcut actions. */
export type ShortcutAction =
  | 'toggleSidebar'
  | 'openSettings'
  | 'maximizeFocusedCell'
  | 'openLauncher'
  | 'toggleRightPanel'
  | 'closeFocusedCell'
  | 'closePreview'
  | 'prevTerminal'
  | 'nextTerminal'
  | 'openFolder'
  | 'prevWorkspace'
  | 'nextWorkspace'
  | 'prevProfile'
  | 'nextProfile'
  | 'manageProfiles'

/**
 * A chord stored in a platform-neutral, normalized form: lowercase tokens
 * joined by '+', e.g. 'mod+b' or 'mod+,'. 'mod' resolves to ⌘ on macOS and
 * Ctrl elsewhere.
 */
export type ShortcutMap = Record<ShortcutAction, string>

/** Result of checking the project's GitHub releases for a newer version. */
export interface UpdateInfo {
  /** The running app version (from app.getVersion()). */
  currentVersion: string
  /** Latest published release version without a leading 'v', or null if unknown. */
  latestVersion: string | null
  /** True when latestVersion is strictly newer than currentVersion. */
  updateAvailable: boolean
  /** Web page to open to get the update (the latest release, else the list). */
  releaseUrl: string
}

/** Lifecycle phase of a user-initiated in-app update download. */
export type UpdatePhase = 'idle' | 'downloading' | 'downloaded' | 'error'

/** Progress pushed from the main process while downloading/installing an update. */
export interface UpdateProgress {
  phase: UpdatePhase
  /** Download completion, 0–100, while phase is 'downloading'. */
  percent?: number
  /** Present when phase is 'error' (e.g. the release has no update feed yet). */
  error?: string
}

/** Persisted layout state for the left/right sidebars, restored on launch. */
export interface UiState {
  sidebarCollapsed: boolean
  rightSidebarOpen: boolean
}

export interface AppSettings {
  theme: ThemeMode
  language: Language
  shortcuts: ShortcutMap
  ui: UiState
  /** Hex color a workspace tab pulses with when one of its terminals finishes. */
  attentionColor: string
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
  /** optional hex tint (e.g. '#D97757') used for the top bar while this session is active */
  color?: string
  /** active presets are shown as launch buttons in place of the defaults */
  active: boolean
  /** Stable link to a managed custom-memory preset, e.g. "claude:work". */
  customMemoryId?: string
}

export interface PresetsState {
  presets: TerminalPreset[]
}

export type CustomMemoryProvider = 'claude' | 'codex'

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

/** A CLI the built-in presets launch, checked for availability on startup. */
export type CliToolId = 'claude' | 'codex'

/**
 * Health of a CLI tool relative to the terminal this app spawns. The daemon runs
 * preset commands in a login shell (`$SHELL -l -c …`), so a CLI can be installed
 * yet still "not found" when its PATH/alias only lives in an interactive-only rc
 * file (e.g. ~/.zshrc). {@link availableInShell} reflects the shell the app uses.
 */
export interface CliToolStatus {
  id: CliToolId
  /** Display name, e.g. 'Claude'. */
  label: string
  /** The command the presets invoke, e.g. 'claude'. */
  executable: string
  /** The CLI was found somewhere on disk / in any of the user's shells. */
  installed: boolean
  /** The command resolves in the login shell the daemon launches presets with. */
  availableInShell: boolean
  /** Absolute path to the binary when discovered, else null. */
  installedPath: string | null
  /** Installed but not visible to the app's shell, and we can repair it. */
  fixable: boolean
}

/** Result of an attempted auto-fix (adding the binary's dir to the shell env file). */
export interface CliToolFixResult {
  status: CliToolStatus
  /** The shell config file that was written to (basename), when a fix was applied. */
  fixedFile?: string
  /** Stable reason code when no fix was applied: 'not-installed' | 'unsupported' | 'already-available'. */
  error?: string
}

/**
 * A named set of folders. Profiles let one user keep separate, switchable
 * collections of projects (e.g. "Work" vs "Personal"). Every install has at
 * least one profile; legacy folders are migrated into a "Default" profile.
 */
export interface Profile {
  /** crypto.randomUUID() */
  id: string
  /** user-editable display name */
  name: string
  /**
   * The workspace that was active last time this profile was selected. Restored
   * when the profile is re-activated, so switching profiles away and back keeps
   * the previous selection instead of jumping to another folder.
   */
  lastWorkspaceId?: string
  createdAt: number
}

/** A project folder (cwd for its workspaces' terminals). */
export interface Folder {
  path: string
  /** basename of path */
  name: string
  /**
   * The profile this folder belongs to. Always present in normalized state; an
   * absent value (legacy data) is migrated to the active/default profile on read.
   */
  profileId?: string
  /** User-chosen display name shown instead of `name` in the sidebar. The path is immutable. */
  displayName?: string
  /** User-uploaded custom icon as a data URL, shown instead of the default folder glyph. */
  icon?: string
  /** Hex color (e.g. '#3B82F6') tinting the folder's row background in the sidebar. */
  color?: string
  /** True when the user has rolled the folder up in the sidebar; persisted across restarts. */
  collapsed?: boolean
  lastOpenedAt: number
}

/** Patch for {@link Folder} visuals; a null field clears the stored value. */
export interface FolderUpdate {
  displayName?: string | null
  icon?: string | null
  color?: string | null
  /** Sidebar expand/collapse state. Absent leaves it untouched. */
  collapsed?: boolean
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
  /**
   * When set, this workspace is backed by a git worktree at this absolute,
   * canonical path. Its terminals launch with cwd = worktreePath (an isolated
   * branch checkout) instead of folderPath, so parallel agents don't collide.
   * Absent on plain workspaces.
   */
  worktreePath?: string
  /** Branch checked out in the worktree (display + git ops). Absent on plain workspaces. */
  branch?: string
}

/** A local branch, for the worktree-create picker. */
export interface BranchInfo {
  name: string
  /** the repo's current HEAD branch */
  isCurrent: boolean
  /** already checked out in some worktree (can't be checked out again) */
  isCheckedOut: boolean
}

/** Payload to create a worktree-backed workspace. */
export interface WorktreeAddArgs {
  folderPath: string
  /** workspace display name */
  name: string
  /** branch to create (createBranch) or check out (existing) */
  branch: string
  /** true → create a new branch from HEAD; false → check out an existing branch */
  createBranch: boolean
}

/** Result of creating a worktree-backed workspace. */
export type WorktreeAddResult = WorkspaceState | { error: string }

/**
 * Stable error codes thrown by the worktree service and surfaced as `error`
 * strings over IPC. The renderer maps these to localized messages; anything
 * else (a raw git failure) is shown verbatim.
 */
export const WORKTREE_ERROR = {
  NOT_A_REPO: 'worktree:not-a-repo',
  BRANCH_EXISTS: 'worktree:branch-exists',
  BRANCH_CHECKED_OUT: 'worktree:branch-checked-out',
  INVALID_FOLDER: 'worktree:invalid-folder'
} as const
export type WorktreeErrorCode = (typeof WORKTREE_ERROR)[keyof typeof WORKTREE_ERROR]

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
  /** optional hex tint inherited from the launching preset, used for the top bar */
  color?: string
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
  color?: string
  /** working directory (the workspace's folder path) */
  cwd: string
  /** the workspace this session belongs to */
  workspaceId: string
  cols?: number
  rows?: number
}

/** Saved profiles + folders + their workspaces, plus the active selections. */
export interface WorkspaceState {
  /** Always non-empty in normalized state (a "Default" profile is seeded). */
  profiles: Profile[]
  /** The currently selected profile; the sidebar shows only its folders. */
  activeProfileId: string | null
  folders: Folder[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}

/** Git state for the folder backing the active workspace. */
export interface GitStatus {
  isRepository: boolean
  /** Current branch, or a short commit id while HEAD is detached. */
  branch: string | null
  /** Number of files with uncommitted changes (tracked + untracked). */
  changedFiles?: number
  /** Total added lines across the working-tree diff (incl. untracked). */
  additions?: number
  /** Total removed lines across the working-tree diff. */
  deletions?: number
  error?: string
}

/** Working-tree status of a single file in a diff. */
export type GitFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'

/** One line inside a diff hunk. `content` excludes the leading +/-/space marker. */
export interface GitDiffLine {
  type: 'add' | 'del' | 'context'
  content: string
  /** Line number in the old file (null for added lines). */
  oldLine: number | null
  /** Line number in the new file (null for removed lines). */
  newLine: number | null
}

/** A contiguous block of changes within a file. */
export interface GitDiffHunk {
  /** The raw `@@ -a,b +c,d @@` header. */
  header: string
  lines: GitDiffLine[]
}

/** All changes to one file relative to HEAD (or the index for fresh repos). */
export interface GitDiffFile {
  path: string
  /** Original path for renames, otherwise null. */
  oldPath: string | null
  status: GitFileStatus
  additions: number
  deletions: number
  binary: boolean
  /** Content omitted because the file is binary or too large to display. */
  truncated: boolean
  hunks: GitDiffHunk[]
}

/** One entry (file or directory) inside a listed directory. */
export interface FsEntry {
  name: string
  /** Absolute path to the entry. */
  path: string
  isDirectory: boolean
}

/** Result of listing a single directory level (children only). */
export interface FsListResult {
  entries: FsEntry[]
  /** Set when the search hit its result/visit cap and stopped early. */
  truncated?: boolean
  error?: string
}

/** How to read a file for preview. */
export interface FileReadOptions {
  /** Read at most this many bytes; content beyond it is not loaded. */
  maxBytes: number
  /** Return content base64-encoded (for images) instead of utf-8 text. */
  asBase64: boolean
  /** When false, only stat the file (size) without reading any content. */
  read: boolean
}

/** File content + metadata for the preview panel. Never mutates the file. */
export interface FileReadResult {
  /** Total size on disk, in bytes. */
  size: number
  /** True when the file is larger than the requested limit (content omitted/partial). */
  truncated: boolean
  /** Encoding of `content`; 'none' when nothing was read. */
  encoding: 'utf8' | 'base64' | 'none'
  content: string
  /** True when the read bytes contained a NUL, i.e. the file looks binary. */
  isBinary: boolean
  error?: string
}

/** Aggregate working-tree diff for the active folder, plus per-file detail. */
export interface GitDiff {
  isRepository: boolean
  branch: string | null
  files: GitDiffFile[]
  totals: { files: number; additions: number; deletions: number }
  error?: string
}

/** Result returned from a start-agent request. */
export type StartAgentResult = { session: AgentSession } | { error: string }

/** main -> renderer data event payload */
export interface AgentDataEvent {
  id: string
  data: string
  /** Historical daemon scrollback replayed during attach, not fresh PTY output. */
  replay?: boolean
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
  PROFILE_ADD: 'profile:add',
  PROFILE_RENAME: 'profile:rename',
  PROFILE_REMOVE: 'profile:remove',
  PROFILE_SET_ACTIVE: 'profile:set-active',
  FOLDER_ADD: 'folder:add',
  FOLDER_REMOVE: 'folder:remove',
  FOLDER_REORDER: 'folder:reorder',
  FOLDER_UPDATE: 'folder:update',
  WORKSPACE_ADD: 'workspace:add',
  WORKSPACE_RENAME: 'workspace:rename',
  WORKSPACE_REMOVE: 'workspace:remove',
  WORKSPACE_SET_ACTIVE: 'workspace:set-active',
  WORKSPACE_ADD_WORKTREE: 'workspace:add-worktree',
  WORKTREE_LIST_BRANCHES: 'worktree:list-branches',
  WORKTREE_IS_DIRTY: 'worktree:is-dirty',
  GIT_STATUS: 'git:status',
  GIT_INIT: 'git:init',
  GIT_DIFF: 'git:diff',
  FS_LIST_DIR: 'fs:list-dir',
  FS_SEARCH: 'fs:search',
  FS_READ_FILE: 'fs:read-file',
  SHELL_OPEN_PATH: 'shell:open-path',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_THEME: 'settings:set-theme',
  SETTINGS_SET_LANGUAGE: 'settings:set-language',
  SETTINGS_SET_SHORTCUTS: 'settings:set-shortcuts',
  SETTINGS_SET_UI: 'settings:set-ui',
  SETTINGS_SET_ATTENTION_COLOR: 'settings:set-attention-color',
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
  CLI_TOOLS_CHECK: 'cli-tools:check',
  CLI_TOOL_FIX: 'cli-tools:fix',
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
  LAYOUT_SET: 'layout:set',
  UPDATE_CHECK: 'update:check',
  UPDATE_OPEN: 'update:open',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status'
} as const
