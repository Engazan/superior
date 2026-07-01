import { useCallback, useEffect, useMemo, useState } from 'react'
import { type LaunchConfig } from '../components/AgentLauncher'
import { type GridLayout } from '../gridLayout'
import { type TFunction } from '../i18n'
import {
  WORKTREE_ERROR,
  type AgentSession,
  type CloneArgs,
  type Folder,
  type FolderUpdate,
  type Profile,
  type ProfileUpdate,
  type TerminalPreset,
  type Workspace,
  type WorkspaceState,
  type WorkspaceTab,
  type WorkspaceTabs,
  type WorktreeAddArgs
} from '../types'

interface Deps {
  setError: (message: string | null) => void
  t: TFunction
  presets: TerminalPreset[]
}

/**
 * Owns folders/workspaces/sessions/layouts and every mutation over them, plus
 * the launch-time restore of surviving daemon sessions. App composes this with
 * the UI-state hooks and wires the handlers to the layout.
 */
export function useWorkspaceSessions({ setError, t, presets }: Deps) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  // Per-workspace tabs (each tab is a grid of terminals) + the active tab, kept
  // in memory and mirrored to disk. A workspace always has at least one tab.
  const [tabsByWs, setTabsByWs] = useState<Record<string, WorkspaceTabs>>({})
  // A grid cell blown up to fill the panel (null = none).
  const [maximizedId, setMaximizedId] = useState<string | null>(null)

  // The active tab id of a workspace, if known.
  const activeTabId = useCallback(
    (workspaceId: string | null): string | undefined =>
      workspaceId ? tabsByWs[workspaceId]?.activeTabId : undefined,
    [tabsByWs]
  )

  // Mint a fresh tab with an auto-generated "Tab N" name.
  const newTab = useCallback(
    (n: number): WorkspaceTab => ({ id: crypto.randomUUID(), name: t('tab.defaultName', { n }) }),
    [t]
  )

  // Only the active profile's folders are shown in the sidebar; workspaces are
  // grouped under folders, so filtering folders transitively scopes everything.
  const visibleFolders = useMemo(
    () => folders.filter((f) => f.profileId === activeProfileId),
    [folders, activeProfileId]
  )

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  )
  const activeFolder = useMemo(
    () => folders.find((f) => f.path === activeWorkspace?.folderPath) ?? null,
    [folders, activeWorkspace]
  )
  // The working directory for this workspace's terminals: its worktree when
  // worktree-backed, else the repo root. Also drives git status/diff scoping.
  const effectiveDir = useMemo(
    () => activeWorkspace?.worktreePath ?? activeFolder?.path ?? null,
    [activeWorkspace, activeFolder]
  )

  // Running-terminal count per workspace, for the sidebar badges.
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sessions) {
      if (s.status === 'running') map[s.workspaceId] = (map[s.workspaceId] ?? 0) + 1
    }
    return map
  }, [sessions])

  // Restore folders/workspaces, then reattach surviving daemon sessions.
  useEffect(() => {
    ;(async () => {
      const ws = await window.api.listWorkspaces()
      setProfiles(ws.profiles)
      setActiveProfileId(ws.activeProfileId)
      setFolders(ws.folders)
      setWorkspaces(ws.workspaces)
      setActiveWorkspaceId(ws.activeWorkspaceId)

      const [restored, tabsState] = await Promise.all([
        window.api.restoreSessions(),
        window.api.getTabs()
      ])

      // Keep only sessions whose workspace still exists; kill orphans.
      const validIds = new Set(ws.workspaces.map((w) => w.id))
      const live = restored.filter((s) => {
        if (validIds.has(s.workspaceId)) return true
        window.api.killAgent(s.id)
        return false
      })

      // Adopt persisted tabs for surviving workspaces; seed a default tab for any
      // workspace that has sessions but no stored tabs (and persist the seed so
      // its id stays stable). Then pin each session to a valid tab.
      const nextTabs: Record<string, WorkspaceTabs> = {}
      for (const [wsId, wt] of Object.entries(tabsState)) {
        if (validIds.has(wsId) && wt.tabs.length) nextTabs[wsId] = wt
      }
      const ensure = (workspaceId: string): WorkspaceTabs => {
        let wt = nextTabs[workspaceId]
        if (!wt || !wt.tabs.length) {
          const tab = newTab(1)
          wt = { tabs: [tab], activeTabId: tab.id }
          nextTabs[workspaceId] = wt
          window.api.setTabs(workspaceId, wt)
        }
        return wt
      }
      const pinned = live.map((s) => {
        const wt = ensure(s.workspaceId)
        return wt.tabs.some((tb) => tb.id === s.tabId) ? s : { ...s, tabId: wt.activeTabId }
      })
      setSessions(pinned)
      setTabsByWs(nextTabs)

      const active = ws.activeWorkspaceId
      const tab = active ? nextTabs[active]?.activeTabId : undefined
      const inActive = pinned.filter((s) => s.workspaceId === active && s.tabId === tab)
      setActiveSessionId(inActive.length ? inActive[inActive.length - 1].id : null)
    })().catch((err) => console.error('[restore] failed:', err))
  }, [newTab])

  // A folder opened out-of-band (e.g. `superior .` while the app is running) is
  // pushed from main; adopt the new state and select the folder it activated.
  useEffect(() => {
    return window.api.onWorkspaceStateChanged((state) => {
      setProfiles(state.profiles)
      setActiveProfileId(state.activeProfileId)
      setFolders(state.folders)
      setWorkspaces(state.workspaces)
      setActiveWorkspaceId(state.activeWorkspaceId)
    })
  }, [])

  // Point the active session at the most recent session of a workspace's active tab.
  const focusWorkspaceSession = useCallback(
    (workspaceId: string | null) => {
      const tabId = activeTabId(workspaceId)
      const list = sessions.filter(
        (s) => s.workspaceId === workspaceId && (!tabId || s.tabId === tabId)
      )
      setActiveSessionId(list.length ? list[list.length - 1].id : null)
    },
    [sessions, activeTabId]
  )

  const applyState = useCallback(
    (state: WorkspaceState) => {
      setProfiles(state.profiles)
      setActiveProfileId(state.activeProfileId)
      setFolders(state.folders)
      setWorkspaces(state.workspaces)
      setActiveWorkspaceId(state.activeWorkspaceId)
      focusWorkspaceSession(state.activeWorkspaceId)
    },
    [focusWorkspaceSession]
  )

  const addFolder = useCallback(async () => {
    setError(null)
    const res = await window.api.addFolder()
    if (!res) return // cancelled
    if ('error' in res) {
      setError(res.error)
      return
    }
    applyState(res)
  }, [applyState, setError])

  /**
   * Clone a forge repo (main picks the destination dir) and open it as a folder.
   * Returns a stable error code on failure, or null on success/cancel so the
   * caller (the clone modal) can localize and stay open on error.
   */
  const cloneRepository = useCallback(
    async (args: CloneArgs): Promise<string | null> => {
      setError(null)
      const res = await window.api.cloneRepository(args)
      if ('canceled' in res) return null
      if ('error' in res) return res.error
      applyState(res.state)
      return null
    },
    [applyState, setError]
  )

  const removeFolder = useCallback(
    async (folderPath: string) => {
      setError(null)
      const ids = new Set(workspaces.filter((w) => w.folderPath === folderPath).map((w) => w.id))
      sessions.filter((s) => ids.has(s.workspaceId)).forEach((s) => window.api.killAgent(s.id))
      setSessions((prev) => prev.filter((s) => !ids.has(s.workspaceId)))
      applyState(await window.api.removeFolder(folderPath))
    },
    [workspaces, sessions, applyState, setError]
  )

  // Drag-to-reorder in the sidebar: apply the new order optimistically, then
  // persist. On failure, fall back to the authoritative state from disk.
  const reorderFolders = useCallback(
    async (orderedPaths: string[]) => {
      setFolders((prev) => {
        const byPath = new Map(prev.map((f) => [f.path, f]))
        const next = orderedPaths.map((p) => byPath.get(p)).filter((f): f is Folder => !!f)
        for (const f of prev) if (!next.includes(f)) next.push(f)
        return next
      })
      try {
        const state = await window.api.reorderFolders(orderedPaths)
        setFolders(state.folders)
      } catch (error) {
        setError((error as Error).message)
        const state = await window.api.listWorkspaces()
        setFolders(state.folders)
      }
    },
    [setError]
  )

  // Edit a folder's display name / custom icon; its path is immutable.
  const updateFolder = useCallback(
    async (folderPath: string, patch: FolderUpdate) => {
      setError(null)
      try {
        const state = await window.api.updateFolder(folderPath, patch)
        setFolders(state.folders)
      } catch (error) {
        setError((error as Error).message)
      }
    },
    [setError]
  )

  // Create a profile (switches to it; its folder list starts empty).
  const addProfile = useCallback(
    async (name: string) => {
      setError(null)
      applyState(await window.api.addProfile(name))
    },
    [applyState, setError]
  )

  const renameProfile = useCallback(async (id: string, name: string) => {
    const state = await window.api.renameProfile(id, name)
    setProfiles(state.profiles)
  }, [])

  // Edit a profile's accent color (tints the title bar + sidebar when active).
  const updateProfile = useCallback(async (id: string, patch: ProfileUpdate) => {
    const state = await window.api.updateProfile(id, patch)
    setProfiles(state.profiles)
  }, [])

  // Delete a profile and every folder/workspace it owns, killing their sessions.
  const removeProfile = useCallback(
    async (id: string) => {
      setError(null)
      const doomedPaths = new Set(
        folders.filter((f) => f.profileId === id).map((f) => f.path)
      )
      const doomedWsIds = new Set(
        workspaces.filter((w) => doomedPaths.has(w.folderPath)).map((w) => w.id)
      )
      sessions
        .filter((s) => doomedWsIds.has(s.workspaceId))
        .forEach((s) => window.api.killAgent(s.id))
      setSessions((prev) => prev.filter((s) => !doomedWsIds.has(s.workspaceId)))
      applyState(await window.api.removeProfile(id))
    },
    [folders, workspaces, sessions, applyState, setError]
  )

  const selectProfile = useCallback(
    async (id: string) => {
      if (id === activeProfileId) return
      applyState(await window.api.setActiveProfile(id))
    },
    [activeProfileId, applyState]
  )

  const addWorkspace = useCallback(
    async (folderPath: string, name: string): Promise<string | null> => {
      setError(null)
      try {
        applyState(await window.api.addWorkspace(folderPath, name))
        return null
      } catch (error) {
        const message = (error as Error).message
        setError(message)
        return message
      }
    },
    [applyState, setError]
  )

  // Map a worktree failure (a WORKTREE_ERROR code, or raw git stderr) to a
  // localized message.
  const worktreeErrorMessage = useCallback(
    (raw: string): string => {
      switch (raw) {
        case WORKTREE_ERROR.NOT_A_REPO:
        case WORKTREE_ERROR.INVALID_FOLDER:
          return t('error.notARepo')
        case WORKTREE_ERROR.BRANCH_EXISTS:
          return t('error.branchExists')
        case WORKTREE_ERROR.BRANCH_CHECKED_OUT:
          return t('error.branchCheckedOut')
        default:
          return t('error.worktreeCreateFailed', { message: raw })
      }
    },
    [t]
  )

  /** Create a worktree-backed workspace. Returns null on success or a localized error. */
  const addWorktreeWorkspace = useCallback(
    async (args: WorktreeAddArgs): Promise<string | null> => {
      setError(null)
      try {
        const res = await window.api.addWorktreeWorkspace(args)
        if ('error' in res) {
          const message = worktreeErrorMessage(res.error)
          setError(message)
          return message
        }
        applyState(res)
        return null
      } catch (error) {
        const message = worktreeErrorMessage((error as Error).message)
        setError(message)
        return message
      }
    },
    [applyState, setError, worktreeErrorMessage]
  )

  const renameWorkspace = useCallback(async (id: string, name: string) => {
    const state = await window.api.renameWorkspace(id, name)
    setWorkspaces(state.workspaces)
  }, [])

  const selectWorkspace = useCallback(
    async (id: string) => {
      if (id === activeWorkspaceId) return
      setActiveWorkspaceId(id)
      focusWorkspaceSession(id)
      const state = await window.api.setActiveWorkspace(id)
      setWorkspaces(state.workspaces)
    },
    [activeWorkspaceId, focusWorkspaceSession]
  )

  const removeWorkspace = useCallback(
    async (id: string) => {
      setError(null)
      const ws = workspaces.find((w) => w.id === id)
      const running = (counts[id] ?? 0) > 0

      // Worktree-backed: confirm before discarding uncommitted work or stopping
      // running terminals, since removal force-deletes the isolated checkout.
      let force = false
      if (ws?.worktreePath) {
        const dirty = await window.api.isWorktreeDirty(ws.worktreePath)
        if (dirty || running) {
          const message = dirty ? t('worktree.removeDirtyBody') : t('worktree.removeRunningBody')
          if (!window.confirm(message)) return
          force = true
        }
      } else if (!window.confirm(t('sidebar.removeWorkspaceConfirm', { name: ws?.name ?? '' }))) {
        // Plain workspace: confirm before discarding it (and any open terminals).
        return
      }

      sessions.filter((s) => s.workspaceId === id).forEach((s) => window.api.killAgent(s.id))
      setSessions((prev) => prev.filter((s) => s.workspaceId !== id))
      try {
        applyState(await window.api.removeWorkspace(id, force))
      } catch (err) {
        setError(worktreeErrorMessage((err as Error).message))
      }
    },
    [workspaces, counts, sessions, applyState, setError, t, worktreeErrorMessage]
  )

  // Ensure a workspace has an active tab and return its id, seeding + persisting
  // a default "Tab 1" when the workspace has none yet (fresh workspace).
  const ensureActiveTab = useCallback(
    (workspaceId: string): string => {
      const wt = tabsByWs[workspaceId]
      if (wt && wt.tabs.length) return wt.activeTabId
      const tab = newTab(1)
      const next: WorkspaceTabs = { tabs: [tab], activeTabId: tab.id }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      window.api.setTabs(workspaceId, next)
      return tab.id
    },
    [tabsByWs, newTab]
  )

  const launchAgent = useCallback(
    async (preset: TerminalPreset) => {
      setError(null)
      if (!activeWorkspace || !effectiveDir) {
        setError(t('error.noWorkspace'))
        return
      }
      const tabId = ensureActiveTab(activeWorkspace.id)
      const res = await window.api.startAgent({
        command: preset.command,
        label: preset.name,
        iconType: preset.iconType,
        icon: preset.icon,
        color: preset.color,
        cwd: effectiveDir,
        workspaceId: activeWorkspace.id,
        tabId
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSessions((prev) => [...prev, res.session])
      setActiveSessionId(res.session.id)
    },
    [activeWorkspace, effectiveDir, ensureActiveTab, t, setError]
  )

  // Fill the active tab's grid from the launch wizard: spawn each chosen preset.
  const startLayout = useCallback(
    async ({ presetIds }: LaunchConfig) => {
      setError(null)
      if (!activeWorkspace || !effectiveDir) {
        setError(t('error.noWorkspace'))
        return
      }
      const wsId = activeWorkspace.id
      const tabId = ensureActiveTab(wsId)
      const launched: AgentSession[] = []
      for (const id of presetIds) {
        const preset = presets.find((p) => p.id === id)
        if (!preset) continue
        const res = await window.api.startAgent({
          command: preset.command,
          label: preset.name,
          iconType: preset.iconType,
          icon: preset.icon,
          color: preset.color,
          cwd: effectiveDir,
          workspaceId: wsId,
          tabId
        })
        if ('error' in res) {
          setError(res.error)
          continue
        }
        launched.push(res.session)
      }
      if (launched.length) {
        setSessions((prev) => [...prev, ...launched])
        setActiveSessionId(launched[launched.length - 1].id)
      }
    },
    [activeWorkspace, effectiveDir, ensureActiveTab, presets, t, setError]
  )

  // Persist a grid sizing change onto the active workspace's active tab.
  const setGridLayout = useCallback(
    (layout: GridLayout) => {
      if (!activeWorkspaceId) return
      const wt = tabsByWs[activeWorkspaceId]
      if (!wt) return
      const next: WorkspaceTabs = {
        ...wt,
        tabs: wt.tabs.map((tb) => (tb.id === wt.activeTabId ? { ...tb, gridLayout: layout } : tb))
      }
      setTabsByWs((prev) => ({ ...prev, [activeWorkspaceId]: next }))
      window.api.setTabs(activeWorkspaceId, next)
    },
    [activeWorkspaceId, tabsByWs]
  )

  const updateSession = useCallback((id: string, patch: Partial<AgentSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  // Re-run an exited session's original preset command in place. The dead daemon
  // session is already gone (it deletes itself on exit), so we spawn a fresh one
  // and swap it into the same slot — preserving grid/tab position and focus — so
  // the terminal that showed "[process exited]" comes back to life running the
  // same command.
  const restartSession = useCallback(
    async (id: string) => {
      setError(null)
      const prev = sessions.find((s) => s.id === id)
      if (!prev) return
      if (!effectiveDir) {
        setError(t('error.noWorkspace'))
        return
      }
      const res = await window.api.startAgent({
        command: prev.command,
        label: prev.label,
        iconType: prev.iconType,
        icon: prev.icon,
        color: prev.color,
        cwd: effectiveDir,
        workspaceId: prev.workspaceId,
        tabId: prev.tabId,
        cols: prev.cols,
        rows: prev.rows
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSessions((curr) => curr.map((s) => (s.id === id ? res.session : s)))
      setActiveSessionId((curr) => (curr === id ? res.session.id : curr))
    },
    [sessions, effectiveDir, t, setError]
  )

  const closeSession = useCallback((id: string) => {
    window.api.killAgent(id)
    setSessions((prev) => {
      const closed = prev.find((s) => s.id === id)
      const next = prev.filter((s) => s.id !== id)
      setActiveSessionId((curr) => {
        if (curr !== id) return curr
        const siblings = next.filter(
          (s) => s.workspaceId === closed?.workspaceId && s.tabId === closed?.tabId
        )
        return siblings.length ? siblings[siblings.length - 1].id : null
      })
      return next
    })
  }, [])

  // Toggle a grid cell's maximized state and focus it (per-cell button).
  const toggleMaximize = useCallback((id: string) => {
    setMaximizedId((cur) => (cur === id ? null : id))
    setActiveSessionId(id)
  }, [])

  // Maximize/restore the focused grid cell (keyboard shortcut) within the active tab.
  const toggleMaximizeFocused = useCallback(() => {
    if (!activeWorkspaceId) return
    const tabId = activeTabId(activeWorkspaceId)
    const cells = sessions.filter((s) => s.workspaceId === activeWorkspaceId && s.tabId === tabId)
    if (!cells.length) return
    const id = cells.some((s) => s.id === activeSessionId)
      ? (activeSessionId as string)
      : cells[0].id
    setMaximizedId((cur) => (cur === id ? null : id))
    setActiveSessionId(id)
  }, [activeWorkspaceId, activeTabId, activeSessionId, sessions])

  // Step the active session to the previous (-1) or next (+1) terminal of the
  // active workspace's active tab, wrapping around the ends. Returns false when
  // there's nothing to cycle (fewer than two sessions).
  const cycleSession = useCallback(
    (direction: 1 | -1): boolean => {
      if (!activeWorkspaceId) return false
      const tabId = activeTabId(activeWorkspaceId)
      const list = sessions.filter((s) => s.workspaceId === activeWorkspaceId && s.tabId === tabId)
      if (list.length < 2) return false
      const current = list.findIndex((s) => s.id === activeSessionId)
      const base = current === -1 ? 0 : current
      const next = (base + direction + list.length) % list.length
      setMaximizedId(null)
      setActiveSessionId(list[next].id)
      return true
    },
    [activeWorkspaceId, activeTabId, sessions, activeSessionId]
  )

  // Step the active workspace to the previous (-1) or next (+1) workspace within
  // the active profile, in sidebar order (folders, then their workspaces),
  // wrapping around. Returns false when there are fewer than two to cycle.
  const cycleWorkspace = useCallback(
    (direction: 1 | -1): boolean => {
      const order = visibleFolders.flatMap((f) =>
        workspaces.filter((w) => w.folderPath === f.path)
      )
      if (order.length < 2) return false
      const current = order.findIndex((w) => w.id === activeWorkspaceId)
      const base = current === -1 ? 0 : current
      const next = (base + direction + order.length) % order.length
      void selectWorkspace(order[next].id)
      return true
    },
    [visibleFolders, workspaces, activeWorkspaceId, selectWorkspace]
  )

  // Step the active profile to the previous (-1) or next (+1) one, wrapping
  // around. Returns false when there are fewer than two profiles.
  const cycleProfile = useCallback(
    (direction: 1 | -1): boolean => {
      if (profiles.length < 2) return false
      const current = profiles.findIndex((p) => p.id === activeProfileId)
      const base = current === -1 ? 0 : current
      const next = (base + direction + profiles.length) % profiles.length
      void selectProfile(profiles[next].id)
      return true
    },
    [profiles, activeProfileId, selectProfile]
  )

  // Focus the Nth grid cell of the active workspace's active tab. Returns false
  // when there's no such cell.
  const focusGridCell = useCallback(
    (index: number): boolean => {
      if (!activeWorkspaceId) return false
      const tabId = activeTabId(activeWorkspaceId)
      const target = sessions.filter(
        (session) => session.workspaceId === activeWorkspaceId && session.tabId === tabId
      )[index]
      if (!target) return false
      setMaximizedId(null)
      setActiveSessionId(target.id)
      return true
    },
    [activeWorkspaceId, activeTabId, sessions]
  )

  // Add a new (empty) tab to a workspace and switch to it. The empty tab shows
  // the launch wizard until terminals are added.
  const addTab = useCallback(
    (workspaceId: string) => {
      const wt = tabsByWs[workspaceId]
      const tab = newTab((wt?.tabs.length ?? 0) + 1)
      const next: WorkspaceTabs = wt
        ? { tabs: [...wt.tabs, tab], activeTabId: tab.id }
        : { tabs: [tab], activeTabId: tab.id }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      window.api.setTabs(workspaceId, next)
      setMaximizedId(null)
      setActiveSessionId(null)
    },
    [tabsByWs, newTab]
  )

  // Switch a workspace's active tab and focus that tab's most recent terminal.
  const selectTab = useCallback(
    (workspaceId: string, tabId: string) => {
      const wt = tabsByWs[workspaceId]
      if (!wt || wt.activeTabId === tabId) return
      const next: WorkspaceTabs = { ...wt, activeTabId: tabId }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      window.api.setTabs(workspaceId, next)
      setMaximizedId(null)
      const inTab = sessions.filter((s) => s.workspaceId === workspaceId && s.tabId === tabId)
      setActiveSessionId(inTab.length ? inTab[inTab.length - 1].id : null)
    },
    [tabsByWs, sessions]
  )

  const renameTab = useCallback(
    (workspaceId: string, tabId: string, name: string) => {
      const wt = tabsByWs[workspaceId]
      if (!wt) return
      const next: WorkspaceTabs = {
        ...wt,
        tabs: wt.tabs.map((tb) => (tb.id === tabId ? { ...tb, name } : tb))
      }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      window.api.setTabs(workspaceId, next)
    },
    [tabsByWs]
  )

  // Close a tab: kill its terminals, drop it, and pick a sibling active tab.
  // Closing the last tab leaves the workspace with no tabs, so it falls back to
  // the launch wizard (a fresh Tab 1 is minted on the next launch).
  const closeTab = useCallback(
    (workspaceId: string, tabId: string) => {
      const wt = tabsByWs[workspaceId]
      if (!wt) return
      sessions
        .filter((s) => s.workspaceId === workspaceId && s.tabId === tabId)
        .forEach((s) => window.api.killAgent(s.id))
      setSessions((prev) => prev.filter((s) => !(s.workspaceId === workspaceId && s.tabId === tabId)))

      const closingActive = wt.activeTabId === tabId
      const remaining = wt.tabs.filter((tb) => tb.id !== tabId)
      const nextActive = remaining.length
        ? closingActive
          ? remaining[remaining.length - 1].id
          : wt.activeTabId
        : ''
      const next: WorkspaceTabs = { tabs: remaining, activeTabId: nextActive }
      setTabsByWs((prev) => ({ ...prev, [workspaceId]: next }))
      window.api.setTabs(workspaceId, next)
      if (closingActive) {
        setMaximizedId(null)
        const inTab = sessions.filter((s) => s.workspaceId === workspaceId && s.tabId === nextActive)
        setActiveSessionId(inTab.length ? inTab[inTab.length - 1].id : null)
      }
    },
    [tabsByWs, sessions]
  )

  return {
    profiles,
    activeProfileId,
    folders,
    visibleFolders,
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    activeFolder,
    effectiveDir,
    sessions,
    activeSessionId,
    setActiveSessionId,
    tabsByWs,
    maximizedId,
    counts,
    addProfile,
    renameProfile,
    updateProfile,
    removeProfile,
    selectProfile,
    addFolder,
    cloneRepository,
    removeFolder,
    reorderFolders,
    updateFolder,
    addWorkspace,
    addWorktreeWorkspace,
    renameWorkspace,
    selectWorkspace,
    removeWorkspace,
    launchAgent,
    startLayout,
    setGridLayout,
    updateSession,
    restartSession,
    closeSession,
    addTab,
    selectTab,
    renameTab,
    closeTab,
    toggleMaximize,
    toggleMaximizeFocused,
    focusGridCell,
    cycleSession,
    cycleWorkspace,
    cycleProfile
  }
}
