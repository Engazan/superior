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

export function registerIntegrationsIpc(): void {
  handle(IPC.INTEGRATIONS_LIST, (): IntegrationsState => listIntegrations())

  handle(IPC.INTEGRATIONS_SAVE, (integration: Integration): IntegrationsState =>
    saveIntegration(integration)
  )

  handle(IPC.INTEGRATIONS_DELETE, (id: string): IntegrationsState =>
    deleteIntegration(id)
  )

  handle(
    IPC.INTEGRATIONS_TEST,
    (draft: IntegrationDraft): Promise<IntegrationTestResult> => testConnection(draft)
  )

  handle(
    IPC.INTEGRATIONS_LIST_REPOS,
    (integrationId: string): Promise<RepoListResult> => listRepos(integrationId)
  )

  handle(IPC.INTEGRATIONS_CLONE, (args: CloneArgs): Promise<CloneResult> =>
    cloneRepository(args)
  )
}
