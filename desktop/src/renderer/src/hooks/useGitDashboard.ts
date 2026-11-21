import { useCallback, useEffect } from 'react'
import type { Integration } from '../types'
import { DASHBOARD_REFRESH_MS, useDashboardData } from './useDashboardData'

/** Availability and review polling live above the dashboard so its badge works in every mode. */
export function useGitDashboard(folder: string | null, integrations: Integration[]) {
  const resolve = useCallback(async () => ({
    data: folder && integrations.length > 0 ? await window.api.dashboardProject(folder) : null
  }), [folder, integrations])
  const discovery = useDashboardData(integrations.length > 0 ? folder : null, resolve, DASHBOARD_REFRESH_MS)
  const { refresh: resolveNow } = discovery

  const candidate = discovery.data
  const integration = integrations.find((entry) => entry.id === candidate?.integrationId)
  const project = integration ? candidate ?? null : null
  const fullName = project?.fullName
  const projectKey = project ? JSON.stringify([folder, project.integrationId, fullName]) : null
  const readReviews = useCallback(() => window.api.dashboardReviews(folder ?? '', {
    integrationId: integration?.id ?? '', fullName: fullName ?? ''
  }), [folder, integration, fullName])
  const reviews = useDashboardData(projectKey, readReviews, DASHBOARD_REFRESH_MS)
  const { error: reviewError } = reviews
  useEffect(() => {
    if (reviewError === 'unlinked') resolveNow()
  }, [reviewError, resolveNow])

  return { project, projectKey, reviews }
}
