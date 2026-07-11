import type {
  AgentTask,
  CloneArgs,
  FileLinkTarget,
  FileReadOptions,
  FolderUpdate,
  Integration,
  IntegrationDraft,
  LayoutPreset,
  ProfileUpdate,
  Prompt,
  StartAgentArgs,
  TerminalPreset,
  WorkspaceTabs,
  WorktreeAddArgs
} from '@shared/types'

const MAX_META_LENGTH = 10_000
const PROVIDERS = new Set(['github', 'gitlab', 'gitea'])
const TASK_STATUSES = new Set(['queued', 'running', 'done', 'failed', 'canceled'])

export function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
}

export function boundedString(value: unknown, max = MAX_META_LENGTH): value is string {
  return typeof value === 'string' && value.length <= max
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function boundedStringArray(value: unknown, maxItems = 10_000): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => boundedString(item))
}

export function isNullableId(value: unknown): value is string | null {
  return value === null || validId(value)
}

export function invalidPayload(): never {
  throw new Error('invalid-ipc-payload')
}

export function isRemoteTarget(value: unknown): value is { host: string; path: string; name?: string } {
  if (!isRecord(value)) return false
  return (
    boundedString(value.host, 1_000) &&
    boundedString(value.path) &&
    (value.name === undefined || boundedString(value.name, 1_000))
  )
}

export function isStartAgentArgs(value: unknown): value is StartAgentArgs {
  if (!value || typeof value !== 'object') return false
  const args = value as Record<string, unknown>
  if (
    !boundedString(args.command) ||
    !boundedString(args.label) ||
    !boundedString(args.cwd) ||
    !validId(args.workspaceId) ||
    !validId(args.tabId)
  ) return false
  if (args.cols !== undefined && (!Number.isFinite(args.cols) || Number(args.cols) < 1 || Number(args.cols) > 1000)) return false
  if (args.rows !== undefined && (!Number.isFinite(args.rows) || Number(args.rows) < 1 || Number(args.rows) > 1000)) return false
  const target = args.launchTarget
  if (target === undefined) return true
  if (!target || typeof target !== 'object') return false
  const t = target as Record<string, unknown>
  return t.kind === 'local'
    ? boundedString(t.cwd)
    : t.kind === 'remote' && boundedString(t.host) && boundedString(t.path)
}

export function isIntegration(value: unknown): value is Integration {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.provider === 'string' && PROVIDERS.has(item.provider) &&
    boundedString(item.name) &&
    boundedString(item.baseUrl) &&
    boundedString(item.token, 100_000)
  )
}

export function isIntegrationDraft(value: unknown): value is IntegrationDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  return (
    typeof draft.provider === 'string' && PROVIDERS.has(draft.provider) &&
    boundedString(draft.baseUrl) &&
    boundedString(draft.token, 100_000)
  )
}

export function isCloneArgs(value: unknown): value is CloneArgs {
  if (!value || typeof value !== 'object') return false
  const args = value as Record<string, unknown>
  return validId(args.integrationId) && boundedString(args.cloneUrl) && boundedString(args.fullName)
}

export function isProfileUpdate(value: unknown): value is ProfileUpdate {
  if (!isRecord(value)) return false
  return value.color === undefined || value.color === null || boundedString(value.color, 32)
}

export function isFolderUpdate(value: unknown): value is FolderUpdate {
  if (!isRecord(value)) return false
  const optionalText = (field: unknown, max: number): boolean =>
    field === undefined || field === null || boundedString(field, max)
  return (
    optionalText(value.displayName, 1_000) &&
    optionalText(value.icon, 3_000_000) &&
    optionalText(value.color, 32) &&
    (value.collapsed === undefined || typeof value.collapsed === 'boolean')
  )
}

export function isWorktreeAddArgs(value: unknown): value is WorktreeAddArgs {
  if (!isRecord(value)) return false
  return (
    boundedString(value.folderPath) &&
    boundedString(value.name, 1_000) &&
    boundedString(value.branch, 1_000) &&
    typeof value.createBranch === 'boolean'
  )
}

export function isAgentTask(value: unknown): value is AgentTask {
  if (!isRecord(value)) return false
  return (
    validId(value.id) &&
    boundedString(value.folderPath) &&
    boundedString(value.prompt, 1_000_000) &&
    validId(value.presetId) &&
    typeof value.useWorktree === 'boolean' &&
    typeof value.status === 'string' && TASK_STATUSES.has(value.status) &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
  )
}

export function isTerminalPreset(value: unknown): value is TerminalPreset {
  if (!isRecord(value)) return false
  return (
    validId(value.id) &&
    boundedString(value.name, 1_000) &&
    boundedString(value.description, 10_000) &&
    boundedString(value.command, 100_000) &&
    (value.iconType === 'emoji' || value.iconType === 'image') &&
    boundedString(value.icon, 3_000_000) &&
    typeof value.active === 'boolean'
  )
}

export function isLayoutPreset(value: unknown): value is LayoutPreset {
  if (!isRecord(value)) return false
  return (
    validId(value.id) &&
    boundedString(value.name, 1_000) &&
    boundedStringArray(value.presetIds, 100) &&
    (value.nicknames === undefined || boundedStringArray(value.nicknames, 100)) &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
  )
}

export function isPrompt(value: unknown): value is Prompt {
  if (!isRecord(value)) return false
  return (
    validId(value.id) &&
    boundedString(value.name, 1_000) &&
    boundedString(value.text, 1_000_000) &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
  )
}

function isGridLayout(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    Array.isArray(value.rows) && value.rows.length <= 100 &&
    value.rows.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0) &&
    Array.isArray(value.cols) && value.cols.length <= 100 &&
    value.cols.every(
      (row) => Array.isArray(row) && row.length <= 100 &&
        row.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
    )
  )
}

export function isWorkspaceTabs(value: unknown): value is WorkspaceTabs {
  if (!isRecord(value) || !Array.isArray(value.tabs) || value.tabs.length > 100) return false
  return (
    typeof value.activeTabId === 'string' &&
    value.tabs.every(
      (tab) => isRecord(tab) && validId(tab.id) && boundedString(tab.name, 1_000) &&
        (tab.gridLayout === undefined || isGridLayout(tab.gridLayout))
    )
  )
}

export function isFileReadOptions(value: unknown): value is FileReadOptions {
  if (!isRecord(value)) return false
  return (
    typeof value.maxBytes === 'number' && Number.isFinite(value.maxBytes) &&
    typeof value.asBase64 === 'boolean' &&
    typeof value.read === 'boolean'
  )
}

export function isFileLinkTarget(value: unknown): value is FileLinkTarget {
  if (!isRecord(value) || !boundedString(value.path)) return false
  const position = (field: unknown): boolean =>
    field === undefined || (typeof field === 'number' && Number.isInteger(field) && field > 0)
  return position(value.line) && position(value.column)
}

export function isPathArgs(value: unknown): value is { folderPath: string; path: string } {
  return isRecord(value) && boundedString(value.folderPath) && boundedString(value.path)
}
