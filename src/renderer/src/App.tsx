import { useCallback, useEffect, useMemo, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { TerminalPanel, type LayoutMode } from './components/TerminalPanel'
import { type LaunchConfig } from './components/AgentLauncher'
import { SettingsView, type SettingsSection } from './components/SettingsView'
import { QuickLaunch } from './components/QuickLaunch'
import { ensureBus } from './terminalBus'
import { useI18n } from './i18n'
import { useShortcuts, eventToChord, isRecordingShortcut } from './shortcuts'
import { type GridLayout } from './gridLayout'
import type {
  AgentSession,
  Folder,
  GitStatus,
  TerminalPreset,
  Workspace,
  WorkspaceState
} from './types'

type View = 'main' | 'settings'

export default function App(): JSX.Element {
  const { t } = useI18n()
  const { shortcuts } = useShortcuts()
  const [folders, setFolders] = useState<Folder[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('main')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // A grid cell blown up to fill the panel (null = none). Owned here so a shortcut can toggle it.
  const [maximizedId, setMaximizedId] = useState<string | null>(null)
  // Quick-launch preset picker overlay (opened by shortcut).
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [presets, setPresets] = useState<TerminalPreset[]>([])
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)
  // Per-workspace layout mode (tabs vs grid) and grid sizing, kept in memory.
  const [layouts, setLayouts] = useState<Record<string, LayoutMode>>({})
  const [gridLayouts, setGridLayouts] = useState<Record<string, GridLayout>>({})

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId]
  )
  const activeFolder = useMemo(
    () => folders.find((f) => f.path === activeWorkspace?.folderPath) ?? null,
    [folders, activeWorkspace]
  )

  // Keep the active folder's branch current, including checkouts made in a terminal.
  useEffect(() => {
    if (!activeFolder) {
      setGitStatus(null)
      setGitLoading(false)
      return
    }

    let active = true
    const folderPath = activeFolder.path
    const refresh = async (showLoading = false): Promise<void> => {
      if (showLoading) setGitLoading(true)
      const status = await window.api.getGitStatus(folderPath)
      if (!active) return
      setGitStatus(status)
      setGitLoading(false)
    }

    setGitStatus(null)
    void refresh(true)
    const id = window.setInterval(() => void refresh(), 3000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [activeFolder])

  const initializeGit = useCallback(async () => {
    if (!activeFolder || gitLoading) return
    setError(null)
    setGitLoading(true)
    const status = await window.api.initGit(activeFolder.path)
    setGitStatus(status)
    setGitLoading(false)
    if (status.error) setError(status.error)
  }, [activeFolder, gitLoading])

  // Running-terminal count per workspace, for the sidebar badges.
  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sessions) {
      if (s.status === 'running') map[s.workspaceId] = (map[s.workspaceId] ?? 0) + 1
    }
    return map
  }, [sessions])

  // Restore folders/workspaces/presets, then reattach surviving daemon sessions.
  useEffect(() => {
    ensureBus()
    window.api.listPresets().then((state) => setPresets(state.presets))
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
  }, [applyState])

  const removeFolder = useCallback(
    async (folderPath: string) => {
      setError(null)
      const ids = new Set(
        workspaces.filter((w) => w.folderPath === folderPath).map((w) => w.id)
      )
      setSessions((prev) => {
        prev.filter((s) => ids.has(s.workspaceId)).forEach((s) => window.api.killAgent(s.id))
        return prev.filter((s) => !ids.has(s.workspaceId))
      })
      applyState(await window.api.removeFolder(folderPath))
    },
    [workspaces, applyState]
  )

  const addWorkspace = useCallback(
    async (folderPath: string, name: string) => {
      setError(null)
      applyState(await window.api.addWorkspace(folderPath, name))
    },
    [applyState]
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

  const removeWorkspace = useCallback(async (id: string) => {
    setError(null)
    setSessions((prev) => {
      prev.filter((s) => s.workspaceId === id).forEach((s) => window.api.killAgent(s.id))
      return prev.filter((s) => s.workspaceId !== id)
    })
    applyState(await window.api.removeWorkspace(id))
  }, [applyState])

  const launchAgent = useCallback(
    async (preset: TerminalPreset) => {
      setError(null)
      if (!activeWorkspace || !activeFolder) {
        setError(t('error.noWorkspace'))
        return
      }
      const res = await window.api.startAgent({
        command: preset.command,
        label: preset.name,
        iconType: preset.iconType,
        icon: preset.icon,
        cwd: activeFolder.path,
        workspaceId: activeWorkspace.id
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSessions((prev) => [...prev, res.session])
      setActiveSessionId(res.session.id)
    },
    [activeWorkspace, activeFolder, t]
  )

  // Start a fresh layout from the launch wizard: set the mode and spawn each preset.
  const startLayout = useCallback(
    async ({ mode, presetIds }: LaunchConfig) => {
      setError(null)
      if (!activeWorkspace || !activeFolder) {
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
          cwd: activeFolder.path,
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
    [activeWorkspace, activeFolder, presets, t]
  )

  // Preset management — each call returns the new state which we mirror locally.
  const savePreset = useCallback(async (preset: TerminalPreset) => {
    setPresets((await window.api.savePreset(preset)).presets)
  }, [])
  const deletePreset = useCallback(async (id: string) => {
    setPresets((await window.api.deletePreset(id)).presets)
  }, [])
  const reorderPresets = useCallback(async (ids: string[]) => {
    setPresets((await window.api.reorderPresets(ids)).presets)
  }, [])
  const togglePresetActive = useCallback(async (id: string, active: boolean) => {
    setPresets((await window.api.setPresetActive(id, active)).presets)
  }, [])
  const openPresets = useCallback(() => {
    setSettingsSection('presets')
    setView('settings')
  }, [])

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
    const id = cells.some((s) => s.id === activeSessionId) ? (activeSessionId as string) : cells[0].id
    setMaximizedId((cur) => (cur === id ? null : id))
    setActiveSessionId(id)
  }, [activeWorkspaceId, layouts, activeSessionId, sessions])

  const focusGridCell = useCallback(
    (index: number): boolean => {
      if (
        view !== 'main' ||
        launcherOpen ||
        !activeWorkspaceId ||
        layouts[activeWorkspaceId] !== 'grid'
      ) {
        return false
      }
      const target = sessions.filter((session) => session.workspaceId === activeWorkspaceId)[index]
      if (!target) return false
      setMaximizedId(null)
      setActiveSessionId(target.id)
      return true
    },
    [view, launcherOpen, activeWorkspaceId, layouts, sessions]
  )

  // Global keyboard shortcuts. Capture phase so they win over a focused terminal;
  // suppressed while a binding is being recorded in settings.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat || isRecordingShortcut()) return
      if (
        e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        /^[1-9]$/.test(e.key) &&
        focusGridCell(Number(e.key) - 1)
      ) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      const chord = eventToChord(e)
      if (!chord) return
      if (chord === shortcuts.toggleSidebar) {
        e.preventDefault()
        e.stopPropagation()
        setSidebarCollapsed((c) => !c)
      } else if (chord === shortcuts.openSettings) {
        e.preventDefault()
        e.stopPropagation()
        setSettingsSection('appearance')
        setView('settings')
      } else if (chord === shortcuts.maximizeFocusedCell) {
        if (view !== 'main') return
        e.preventDefault()
        e.stopPropagation()
        toggleMaximizeFocused()
      } else if (chord === shortcuts.openLauncher) {
        if (view !== 'main') return
        e.preventDefault()
        e.stopPropagation()
        setLauncherOpen((o) => !o && !!activeWorkspaceId)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [shortcuts, view, activeWorkspaceId, toggleMaximizeFocused, focusGridCell])

  return (
    <div className="flex h-full flex-col bg-bar text-fg">
      <TitleBar
        showToggle={view === 'main'}
        gitStatus={view === 'main' ? gitStatus : null}
        gitLoading={gitLoading}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        onInitGit={initializeGit}
        onOpenSettings={() => {
          setSettingsSection('appearance')
          setView('settings')
        }}
      />

      <div className="flex min-h-0 flex-1">
        {view === 'settings' ? (
          <SettingsView
            initialSection={settingsSection}
            onBack={() => setView('main')}
            presets={presets}
            onSavePreset={savePreset}
            onDeletePreset={deletePreset}
            onReorderPresets={reorderPresets}
            onTogglePresetActive={togglePresetActive}
            onPickPresetImage={() => window.api.pickPresetImage()}
            onPresetsChanged={(state) => setPresets(state.presets)}
            workspaces={workspaces}
            folders={folders}
            onKillSession={closeSession}
          />
        ) : (
          <>
            <Sidebar
              folders={folders}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              counts={counts}
              collapsed={sidebarCollapsed}
              onAddFolder={addFolder}
              onRemoveFolder={removeFolder}
              onAddWorkspace={addWorkspace}
              onRenameWorkspace={renameWorkspace}
              onRemoveWorkspace={removeWorkspace}
              onSelectWorkspace={selectWorkspace}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {error && (
                <div className="flex items-start justify-between gap-4 border-b border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-200">
                  <span>{error}</span>
                  <button
                    className="shrink-0 text-red-300/80 hover:text-red-100"
                    onClick={() => setError(null)}
                    aria-label={t('window.close')}
                  >
                    ✕
                  </button>
                </div>
              )}

              <TerminalPanel
                sessions={sessions}
                activeWorkspaceId={activeWorkspaceId}
                activeSessionId={activeSessionId}
                maximizedId={maximizedId}
                layoutMode={activeWorkspaceId ? layouts[activeWorkspaceId] : undefined}
                gridLayout={activeWorkspaceId ? gridLayouts[activeWorkspaceId] : undefined}
                presets={presets}
                onSelect={setActiveSessionId}
                onToggleMaximize={toggleMaximize}
                onClose={closeSession}
                onSessionUpdate={updateSession}
                onStart={startLayout}
                onLaunch={launchAgent}
                onManagePresets={openPresets}
                onGridLayoutChange={setGridLayout}
              />
            </div>
          </>
        )}
      </div>

      {view === 'main' && launcherOpen && (
        <QuickLaunch
          presets={presets.filter((p) => p.active)}
          onSelect={launchAgent}
          onClose={() => setLauncherOpen(false)}
        />
      )}
    </div>
  )
}
