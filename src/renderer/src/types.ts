// Single entry point for shared types in the renderer: every renderer module
// imports types from here (`./types`), never from `@shared/types` directly, so
// the dependency on the shared layer stays in one place. Add renderer-only types
// below the re-export if any are ever needed.
// Runtime value (worktree error codes) — re-exported so renderer modules keep
// importing from './types' rather than reaching into the shared layer.
export { WORKTREE_ERROR } from '@shared/types'

export type {
  AgentDataEvent,
  AgentExitEvent,
  AgentSession,
  AgentStatus,
  AgentUsage,
  AppSettings,
  BranchInfo,
  BranchSwitchResult,
  CliToolFixResult,
  CliToolId,
  CliToolStatus,
  CustomMemoryMutationResult,
  CustomMemoryPreset,
  CustomMemoryProvider,
  FileReadOptions,
  FileReadResult,
  Folder,
  FolderUpdate,
  FsEntry,
  FsListResult,
  GitDiff,
  GitDiffFile,
  GitDiffHunk,
  GitDiffLine,
  GitFileStatus,
  GitStatus,
  Language,
  PresetIconType,
  PresetsState,
  Profile,
  ShortcutAction,
  ShortcutMap,
  StartAgentArgs,
  StartAgentResult,
  TerminalPreset,
  ThemeMode,
  UpdateInfo,
  UpdateProgress,
  Workspace,
  WorkspaceState,
  WorktreeAddArgs,
  WorktreeAddResult,
  WorktreeErrorCode
} from '@shared/types'
