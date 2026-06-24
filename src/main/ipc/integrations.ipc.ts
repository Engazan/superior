import { ipcMain } from 'electron'
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

export function registerIntegrationsIpc(): void {
  ipcMain.handle(IPC.INTEGRATIONS_LIST, (): IntegrationsState => listIntegrations())

  ipcMain.handle(IPC.INTEGRATIONS_SAVE, (_e, integration: Integration): IntegrationsState =>
    saveIntegration(integration)
  )

  ipcMain.handle(IPC.INTEGRATIONS_DELETE, (_e, id: string): IntegrationsState =>
    deleteIntegration(id)
  )

  ipcMain.handle(
    IPC.INTEGRATIONS_TEST,
    (_e, draft: IntegrationDraft): Promise<IntegrationTestResult> => testConnection(draft)
  )

  ipcMain.handle(
    IPC.INTEGRATIONS_LIST_REPOS,
    (_e, integrationId: string): Promise<RepoListResult> => listRepos(integrationId)
  )

  ipcMain.handle(IPC.INTEGRATIONS_CLONE, (_e, args: CloneArgs): Promise<CloneResult> =>
    cloneRepository(args)
  )
}
