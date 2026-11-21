import type { DashboardFilter, DashboardKind, GitProjectBinding } from '@shared/git-dashboard'
import { dashboardDetail, dashboardList, dashboardProject, dashboardReviews } from '../services/git-dashboard.service'
import {
  IPC,
  type CloneArgs,
  type CloneResult,
  type Integration,
  type IntegrationDraft,
  type IntegrationsState,
  type IntegrationTestResult,
  type RepoListResult
} from '@shared/types'
import {
  cloneRepository,
  deleteIntegration,
  listIntegrations,
  listRepos,
  saveIntegration,
  testConnection
} from '../services/integrations.service'
import { handle } from './handle'
import { isCloneArgs, isIntegration, isIntegrationDraft, boundedString, validId } from './validation'

function projectBinding(value: unknown): value is GitProjectBinding {
  if (!value || typeof value !== 'object') return false
  const project = value as Partial<GitProjectBinding>
  return validId(project.integrationId) && boundedString(project.fullName)
}

function dashboardKind(value: unknown): value is DashboardKind {
  return value === 'issue' || value === 'merge-request'
}

function dashboardFilter(value: unknown): value is DashboardFilter {
  if (!value || typeof value !== 'object') return false
  const filter = value as Partial<DashboardFilter>
  return dashboardKind(filter.kind) &&
    (filter.assignee === 'me' || filter.assignee === 'any') &&
    (filter.state === 'open' || filter.state === 'all')
}

export function registerIntegrationsIpc(): void {
  handle(IPC.DASHBOARD_PROJECT, (folder) => boundedString(folder) ? dashboardProject(folder) : null)
  handle(IPC.DASHBOARD_REVIEWS, (folder, project) =>
    boundedString(folder) && projectBinding(project) ? dashboardReviews(folder, project) : { error: 'unlinked' })
  handle(IPC.DASHBOARD_LIST, (folder, project, filter) =>
    boundedString(folder) && projectBinding(project) && dashboardFilter(filter) ? dashboardList(folder, project, filter) : { error: 'unavailable' })
  handle(IPC.DASHBOARD_DETAIL, (folder, project, kind, id) =>
    boundedString(folder) && projectBinding(project) && dashboardKind(kind) && Number.isSafeInteger(id) && id > 0
      ? dashboardDetail(folder, project, kind, id) : { error: 'not-found' })

  handle(IPC.INTEGRATIONS_LIST, (): IntegrationsState => listIntegrations())

  handle(IPC.INTEGRATIONS_SAVE, (integration: Integration): IntegrationsState => {
    if (!isIntegration(integration)) throw new Error('Invalid integration payload.')
    return saveIntegration(integration)
  })

  handle(IPC.INTEGRATIONS_DELETE, (id: string): IntegrationsState =>
    validId(id) ? deleteIntegration(id) : listIntegrations()
  )

  handle(
    IPC.INTEGRATIONS_TEST,
    (draft: IntegrationDraft): Promise<IntegrationTestResult> =>
      isIntegrationDraft(draft)
        ? testConnection(draft)
        : Promise.resolve({ ok: false, error: 'invalid-payload' })
  )

  handle(
    IPC.INTEGRATIONS_LIST_REPOS,
    (integrationId: string): Promise<RepoListResult> =>
      validId(integrationId)
        ? listRepos(integrationId)
        : Promise.resolve({ repos: [], error: 'unknown-integration' })
  )

  handle(IPC.INTEGRATIONS_CLONE, (args: CloneArgs): Promise<CloneResult> =>
    isCloneArgs(args) ? cloneRepository(args) : Promise.resolve({ error: 'invalid-repo' })
  )
}
