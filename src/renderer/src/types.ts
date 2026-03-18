// Single entry point for shared types in the renderer: every renderer module
// imports types from here (`./types`), never from `@shared/types` directly, so
// the dependency on the shared layer stays in one place. Add renderer-only types
// below the re-export if any are ever needed.
export type {
  AgentDataEvent,
  AgentExitEvent,
  AgentSession,
  AgentStatus,
  AppSettings,
  CustomMemoryMutationResult,
  CustomMemoryPreset,
  CustomMemoryProvider,
  FileReadOptions,
  FileReadResult,
  Folder,
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
  ShortcutAction,
  ShortcutMap,
  StartAgentArgs,
  StartAgentResult,
  TerminalPreset,
  ThemeMode,
  Workspace,
  WorkspaceState
} from '@shared/types'
