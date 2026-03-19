import { useCallback, useEffect, useMemo, useState } from 'react'
import { type LayoutMode } from '../components/TerminalPanel'
import { type LaunchConfig } from '../components/AgentLauncher'
import { type GridLayout } from '../gridLayout'
import { type TFunction } from '../i18n'
import {
  WORKTREE_ERROR,
  type AgentSession,
  type Folder,
  type TerminalPreset,
  type Workspace,
  type WorkspaceState,
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
  const [folders, setFolders] = useState<Folder[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  // Per-workspace layout mode (tabs vs grid) and grid sizing, kept in memory.
  const [layouts, setLayouts] = useState<Record<string, LayoutMode>>({})
  const [gridLayouts, setGridLayouts] = useState<Record<string, GridLayout>>({})
  // A grid cell blown up to fill the panel (null = none).
  const [maximizedId, setMaximizedId] = useState<string | null>(null)

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
      setFolders(ws.folders)
      setWorkspaces(ws.workspaces)
      setActiveWorkspaceId(ws.activeWorkspaceId)

      const [restored, layoutsState] = await Promise.all([
        window.api.restoreSessions(),
        window.api.getLayouts()
      ])

      // Keep only sessions whose workspace still exists; kill orphans.
      const validIds = new Set(ws.workspaces.map((w) => w.id))
      const live = restored.filter((s) => {
        if (validIds.has(s.workspaceId)) return true
        window.api.killAgent(s.id)
        return false
      })
      setSessions(live)

      const modeMap: Record<string, LayoutMode> = {}
      const gridMap: Record<string, GridLayout> = {}
      for (const [wsId, layout] of Object.entries(layoutsState)) {
        if (!validIds.has(wsId)) continue
        modeMap[wsId] = layout.mode
        if (layout.gridLayout) gridMap[wsId] = layout.gridLayout
      }
      setLayouts(modeMap)
      setGridLayouts(gridMap)

      const inActive = live.filter((s) => s.workspaceId === ws.activeWorkspaceId)
      setActiveSessionId(inActive.length ? inActive[inActive.length - 1].id : null)
    })().catch((err) => console.error('[restore] failed:', err))
  }, [])

  // Point the active session at the most recent session of a workspace.
  const focusWorkspaceSession = useCallback(
    (workspaceId: string | null) => {
      const list = sessions.filter((s) => s.workspaceId === workspaceId)
      setActiveSessionId(list.length ? list[list.length - 1].id : null)
    },
    [sessions]
  )

  const applyState = useCallback(
    (state: WorkspaceState) => {
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

  const launchAgent = useCallback(
    async (preset: TerminalPreset) => {
      setError(null)
      if (!activeWorkspace || !effectiveDir) {
        setError(t('error.noWorkspace'))
        return
      }
      const res = await window.api.startAgent({
        command: preset.command,
        label: preset.name,
        iconType: preset.iconType,
        icon: preset.icon,
        color: preset.color,
        cwd: effectiveDir,
        workspaceId: activeWorkspace.id
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSessions((prev) => [...prev, res.session])
      setActiveSessionId(res.session.id)
    },
    [activeWorkspace, effectiveDir, t, setError]
  )

  // Start a fresh layout from the launch wizard: set the mode and spawn each preset.
  const startLayout = useCallback(
    async ({ mode, presetIds }: LaunchConfig) => {
      setError(null)
      if (!activeWorkspace || !effectiveDir) {
        setError(t('error.noWorkspace'))
        return
      }
      const wsId = activeWorkspace.id
      setLayouts((prev) => ({ ...prev, [wsId]: mode }))
      window.api.setLayout(wsId, { mode })
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
          workspaceId: wsId
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
    [activeWorkspace, effectiveDir, presets, t, setError]
  )

  const setGridLayout = useCallback(
    (layout: GridLayout) => {
      if (!activeWorkspaceId) return
      setGridLayouts((prev) => ({ ...prev, [activeWorkspaceId]: layout }))
      // Grid sizing only changes in grid mode, so the persisted mode is 'grid'.
      window.api.setLayout(activeWorkspaceId, { mode: 'grid', gridLayout: layout })
    },
    [activeWorkspaceId]
  )

  const updateSession = useCallback((id: string, patch: Partial<AgentSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const closeSession = useCallback((id: string) => {
    window.api.killAgent(id)
    setSessions((prev) => {
      const closed = prev.find((s) => s.id === id)
      const next = prev.filter((s) => s.id !== id)
      setActiveSessionId((curr) => {
        if (curr !== id) return curr
        const siblings = next.filter((s) => s.workspaceId === closed?.workspaceId)
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

  // Maximize/restore the focused grid cell (keyboard shortcut). Grid mode only.
  const toggleMaximizeFocused = useCallback(() => {
    if (!activeWorkspaceId || layouts[activeWorkspaceId] !== 'grid') return
    const cells = sessions.filter((s) => s.workspaceId === activeWorkspaceId)
    if (!cells.length) return
    const id = cells.some((s) => s.id === activeSessionId)
      ? (activeSessionId as string)
      : cells[0].id
    setMaximizedId((cur) => (cur === id ? null : id))
    setActiveSessionId(id)
  }, [activeWorkspaceId, layouts, activeSessionId, sessions])

  // Focus the Nth grid cell of the active workspace. UI-mode guards live in the
  // caller. Returns false when there's no such cell (grid mode required).
  const focusGridCell = useCallback(
    (index: number): boolean => {
      if (!activeWorkspaceId || layouts[activeWorkspaceId] !== 'grid') return false
      const target = sessions.filter((session) => session.workspaceId === activeWorkspaceId)[index]
      if (!target) return false
      setMaximizedId(null)
      setActiveSessionId(target.id)
      return true
    },
    [activeWorkspaceId, layouts, sessions]
  )

  return {
    folders,
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    activeFolder,
    effectiveDir,
    sessions,
    activeSessionId,
    setActiveSessionId,
    layouts,
    gridLayouts,
    maximizedId,
    counts,
    addFolder,
    removeFolder,
    addWorkspace,
    addWorktreeWorkspace,
    renameWorkspace,
    selectWorkspace,
    removeWorkspace,
    launchAgent,
    startLayout,
    setGridLayout,
    updateSession,
    closeSession,
    toggleMaximize,
    toggleMaximizeFocused,
    focusGridCell
  }
}
