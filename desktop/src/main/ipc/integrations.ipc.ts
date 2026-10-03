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
import { isCloneArgs, isIntegration, isIntegrationDraft, validId } from './validation'

export function registerIntegrationsIpc(): void {
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
