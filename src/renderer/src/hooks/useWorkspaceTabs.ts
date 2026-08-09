import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useConfirm } from '../components/ui'
import type { GridLayout } from '../gridLayout'
import type { TFunction } from '../i18n'
import type { AgentSession, WorkspaceTab, WorkspaceTabs } from '../types'

type TabsState = Record<string, WorkspaceTabs>

interface Deps {
  t: TFunction
  sessions: AgentSession[]
  setSessions: Dispatch<SetStateAction<AgentSession[]>>
  setActiveSessionId: Dispatch<SetStateAction<string | null>>
  clearMaximizedTab: (tabId: string) => void
}

/**
 * Owns each workspace's persisted terminal tabs and their grid layout.
 * Session lifecycle remains with useWorkspaceSessions; this hook coordinates
 * only the tab-side effects that select, retain or close those sessions.
 */
export function useWorkspaceTabs({
  t,
  sessions,
  setSessions,
  setActiveSessionId,
  clearMaximizedTab
}: Deps) {
  const confirm = useConfirm()
  const [tabsByWs, setTabsByWs] = useState<TabsState>({})

  const activeTabId = useCallback(
    (workspaceId: string | null): string | undefined =>
      workspaceId ? tabsByWs[workspaceId]?.activeTabId : undefined,
    [tabsByWs]
  )

  const newTab = useCallback(
    (n: number): WorkspaceTab => ({ id: crypto.randomUUID(), name: t('tab.defaultName', { n }) }),
    [t]
  )
  // Startup restoration runs only once, but may finish after a language switch.
  // Keep its default tab label in sync without re-running the restore effect.
  const newTabRef = useRef(newTab)
  newTabRef.current = newTab

  /**
   * Adopts stored tabs for existing workspaces and pins restored sessions to a
   * valid tab. Fresh tab state is persisted immediately so ids remain stable.
   */
  const restoreTabs = useCallback(
    (
      workspaceIds: Set<string>,
      savedTabs: TabsState,
      restoredSessions: AgentSession[]
    ): { tabsByWs: TabsState; sessions: AgentSession[] } => {
      const nextTabs: TabsState = {}
      for (const [workspaceId, tabs] of Object.entries(savedTabs)) {
        if (workspaceIds.has(workspaceId) && tabs.tabs.length) nextTabs[workspaceId] = tabs
      }
      const ensure = (workspaceId: string): WorkspaceTabs => {
        let tabs = nextTabs[workspaceId]
        if (!tabs || !tabs.tabs.length) {
          const tab = newTabRef.current(1)
          tabs = { tabs: [tab], activeTabId: tab.id }
          nextTabs[workspaceId] = tabs
          void window.api.setTabs(workspaceId, tabs)
        }
        return tabs
      }
      const pinned = restoredSessions.map((session) => {
        const tabs = ensure(session.workspaceId)
        return tabs.tabs.some((tab) => tab.id === session.tabId)
          ? session
          : { ...session, tabId: tabs.activeTabId }
      })
      setTabsByWs(nextTabs)
      return { tabsByWs: nextTabs, sessions: pinned }
    },
    []
  )

  // Ensure a workspace has an active tab and return its id, seeding + persisting
  // a default "Tab 1" when the workspace has none yet (fresh workspace).
  const ensureActiveTab = useCallback(
    (workspaceId: string): string => {
      const tabs = tabsByWs[workspaceId]
      if (tabs && tabs.tabs.length) return tabs.activeTabId
      const tab = newTab(1)
      const next: WorkspaceTabs = { tabs: [tab], activeTabId: tab.id }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      void window.api.setTabs(workspaceId, next)
      return tab.id
    },
    [tabsByWs, newTab]
  )

  const setGridLayout = useCallback(
    (workspaceId: string, layout: GridLayout): void => {
      const tabs = tabsByWs[workspaceId]
      if (!tabs) return
      const next: WorkspaceTabs = {
        ...tabs,
        tabs: tabs.tabs.map((tab) =>
          tab.id === tabs.activeTabId ? { ...tab, gridLayout: layout } : tab
        )
      }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      void window.api.setTabs(workspaceId, next)
    },
    [tabsByWs]
  )

  // Add a new (empty) tab to a workspace and switch to it. The empty tab shows
  // the launch wizard until terminals are added.
  const addTab = useCallback(
    (workspaceId: string): void => {
      const tabs = tabsByWs[workspaceId]
      const tab = newTab((tabs?.tabs.length ?? 0) + 1)
      const next: WorkspaceTabs = tabs
        ? { tabs: [...tabs.tabs, tab], activeTabId: tab.id }
        : { tabs: [tab], activeTabId: tab.id }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      void window.api.setTabs(workspaceId, next)
      setActiveSessionId(null)
    },
    [tabsByWs, newTab, setActiveSessionId]
  )

  // Switch a workspace's active tab and focus that tab's most recent terminal.
  const selectTab = useCallback(
    (workspaceId: string, tabId: string): void => {
      const tabs = tabsByWs[workspaceId]
      if (!tabs || tabs.activeTabId === tabId) return
      const next: WorkspaceTabs = { ...tabs, activeTabId: tabId }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      void window.api.setTabs(workspaceId, next)
      const inTab = sessions.filter((session) => session.workspaceId === workspaceId && session.tabId === tabId)
      setActiveSessionId(inTab.length ? inTab[inTab.length - 1].id : null)
    },
    [tabsByWs, sessions, setActiveSessionId]
  )

  const renameTab = useCallback(
    (workspaceId: string, tabId: string, name: string): void => {
      const tabs = tabsByWs[workspaceId]
      if (!tabs) return
      const next: WorkspaceTabs = {
        ...tabs,
        tabs: tabs.tabs.map((tab) => (tab.id === tabId ? { ...tab, name } : tab))
      }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      void window.api.setTabs(workspaceId, next)
    },
    [tabsByWs]
  )

  // Close a tab: kill its terminals, drop it, and pick a sibling active tab.
  // Closing the last tab leaves the workspace with no tabs, so it falls back to
  // the launch wizard (a fresh Tab 1 is minted on the next launch).
  const closeTab = useCallback(
    async (workspaceId: string, tabId: string): Promise<void> => {
      const tabs = tabsByWs[workspaceId]
      if (!tabs) return
      // The hover X sits right next to the tab label — an easy misclick that
      // would kill every terminal in the tab, so running tabs confirm first.
      const runningCount = sessions.filter(
        (session) =>
          session.workspaceId === workspaceId && session.tabId === tabId && session.status === 'running'
      ).length
      if (runningCount > 0) {
        const name = tabs.tabs.find((tab) => tab.id === tabId)?.name ?? ''
        const ok = await confirm({
          title: t('tab.close'),
          message: t('tab.closeRunningConfirm', { name, count: String(runningCount) }),
          confirmLabel: t('tab.close'),
          tone: 'danger'
        })
        if (!ok) return
      }
      sessions
        .filter((session) => session.workspaceId === workspaceId && session.tabId === tabId)
        .forEach((session) => window.api.killAgent(session.id))
      setSessions((prev) =>
        prev.filter((session) => !(session.workspaceId === workspaceId && session.tabId === tabId))
      )

      const closingActive = tabs.activeTabId === tabId
      const remaining = tabs.tabs.filter((tab) => tab.id !== tabId)
      const nextActive = remaining.length
        ? closingActive
          ? remaining[remaining.length - 1].id
          : tabs.activeTabId
        : ''
      const next: WorkspaceTabs = { tabs: remaining, activeTabId: nextActive }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      void window.api.setTabs(workspaceId, next)
      clearMaximizedTab(tabId)
      if (closingActive) {
        const inTab = sessions.filter(
          (session) => session.workspaceId === workspaceId && session.tabId === nextActive
        )
        setActiveSessionId(inTab.length ? inTab[inTab.length - 1].id : null)
      }
    },
    [tabsByWs, sessions, confirm, t, setSessions, clearMaximizedTab, setActiveSessionId]
  )

  return {
    tabsByWs,
    activeTabId,
    restoreTabs,
    ensureActiveTab,
    setGridLayout,
    addTab,
    selectTab,
    renameTab,
    closeTab
  }
}
