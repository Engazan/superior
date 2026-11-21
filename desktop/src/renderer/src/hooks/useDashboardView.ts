import { useEffect, useState } from 'react'
import type { DashboardFilter } from '@shared/git-dashboard'

export type DashboardView = 'items' | 'reviews' | 'blocked'

interface DashboardViewState {
  tab: DashboardFilter['kind']
  assignee: DashboardFilter['assignee']
  state: DashboardFilter['state']
  query: string
  view: DashboardView
  selected?: number | null
  sheetOpen: boolean
}

const DEFAULT_VIEW: DashboardViewState = {
  tab: 'merge-request',
  assignee: 'me',
  state: 'open',
  query: '',
  view: 'items',
  sheetOpen: false
}

function readView(key: string): DashboardViewState {
  try {
    const saved = localStorage.getItem(key)
    if (!saved) return DEFAULT_VIEW
    const value = JSON.parse(saved) as Partial<Record<keyof DashboardViewState, unknown>> | null
    const tab = value?.tab === 'issue' ? 'issue' : DEFAULT_VIEW.tab
    const view = tab === 'merge-request' && (value?.view === 'reviews' || value?.view === 'blocked')
      ? value.view : 'items'
    const id = value?.selected
    const selected = typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : id === null ? null : undefined
    return {
      tab,
      view,
      assignee: value?.assignee === 'any' ? 'any' : DEFAULT_VIEW.assignee,
      state: value?.state === 'all' ? 'all' : DEFAULT_VIEW.state,
      query: typeof value?.query === 'string' ? value.query : DEFAULT_VIEW.query,
      selected,
      sheetOpen: value?.sheetOpen === true && selected !== null
    }
  } catch {
    return DEFAULT_VIEW
  }
}

// GitDashboard is keyed by project, so its initial view always belongs to that project.
export function useDashboardView(projectKey: string) {
  const key = `superior.dashboardView.v1:${projectKey}`
  const [preferences, setPreferences] = useState(() => readView(key))
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(preferences)) } catch { /* Keep the in-memory view if storage is unavailable. */ }
  }, [key, preferences])

  function updateView(update: Partial<DashboardViewState>): void {
    setPreferences((current) => ({ ...current, ...update }))
  }

  return [preferences, updateView] as const
}
