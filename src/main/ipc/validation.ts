import type { CloneArgs, Integration, IntegrationDraft, StartAgentArgs } from '@shared/types'

const MAX_META_LENGTH = 10_000
const PROVIDERS = new Set(['github', 'gitlab', 'gitea'])

export function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
}

export function boundedString(value: unknown, max = MAX_META_LENGTH): value is string {
  return typeof value === 'string' && value.length <= max
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
