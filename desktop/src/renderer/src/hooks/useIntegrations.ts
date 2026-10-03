import { useCallback, useEffect, useState } from 'react'
import type { Integration } from '../types'

/** Loads the saved git-forge integrations used by the project-clone flow. */
export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])

  const reloadIntegrations = useCallback(() => {
    void window.api.listIntegrations().then((state) => setIntegrations(state.integrations))
  }, [])

  useEffect(() => {
    reloadIntegrations()
  }, [reloadIntegrations])

  return { integrations, reloadIntegrations }
}
