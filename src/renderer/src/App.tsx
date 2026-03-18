import { useCallback, useEffect, useMemo, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { TerminalPanel, type LayoutMode } from './components/TerminalPanel'
import { type LaunchConfig } from './components/AgentLauncher'
import { SettingsView, type SettingsSection } from './components/SettingsView'
import { ensureBus } from './terminalBus'
import { useI18n } from './i18n'
import { type GridLayout } from './gridLayout'
import type { AgentSession, TerminalPreset, Workspace, WorkspaceState } from './types'

type View = 'main' | 'settings'

export default function App(): JSX.Element {
  const { t } = useI18n()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('main')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [presets, setPresets] = useState<TerminalPreset[]>([])
  // Per-workspace layout mode (tabs vs grid), kept in memory.
  const [layouts, setLayouts] = useState<Record<string, LayoutMode>>({})
  // Per-workspace grid cell sizing.
  const [gridLayouts, setGridLayouts] = useState<Record<string, GridLayout>>({})

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.path === activePath) ?? null,
    [workspaces, activePath]
  )

  // Restore saved workspaces + presets, and start listening to the agent event stream once.
  useEffect(() => {
    ensureBus()
    window.api.listWorkspaces().then((state) => {
      setWorkspaces(state.workspaces)
      setActivePath(state.activePath)
    })
    window.api.listPresets().then((state) => setPresets(state.presets))
  }, [])

  // Point the active session at the most recent session of the active workspace.
  const focusWorkspaceSession = useCallback(
    (path: string | null) => {
      const list = sessions.filter((s) => s.workspacePath === path)
      setActiveSessionId(list.length ? list[list.length - 1].id : null)
    },
    [sessions]
  )

  const applyState = useCallback(
    (state: WorkspaceState) => {
      setWorkspaces(state.workspaces)
      setActivePath(state.activePath)
      focusWorkspaceSession(state.activePath)
    },
    [focusWorkspaceSession]
  )

  const addWorkspace = useCallback(async () => {
    setError(null)
    const res = await window.api.addWorkspace()
    if (!res) return // cancelled
    if ('error' in res) {
      setError(res.error)
      return
    }
    applyState(res)
  }, [applyState])

  const selectWorkspace = useCallback(
    async (path: string) => {
      if (path === activePath) return
      setActivePath(path)
      focusWorkspaceSession(path)
      const state = await window.api.setActiveWorkspace(path)
      setWorkspaces(state.workspaces)
    },
    [activePath, focusWorkspaceSession]
  )

  const removeWorkspace = useCallback(async (path: string) => {
    setError(null)
    // Kill and drop any sessions belonging to the removed workspace.
    setSessions((prev) => {
      prev.filter((s) => s.workspacePath === path).forEach((s) => window.api.killAgent(s.id))
      return prev.filter((s) => s.workspacePath !== path)
    })
    const state = await window.api.removeWorkspace(path)
    setWorkspaces(state.workspaces)
    setActivePath(state.activePath)
    setActiveSessionId(null)
  }, [])

  const launchAgent = useCallback(
    async (preset: TerminalPreset) => {
      setError(null)
      if (!activeWorkspace) {
        setError(t('error.noWorkspace'))
        return
      }
      const res = await window.api.startAgent({
        command: preset.command,
        label: preset.name,
        iconType: preset.iconType,
        icon: preset.icon,
        workspacePath: activeWorkspace.path
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSessions((prev) => [...prev, res.session])
      setActiveSessionId(res.session.id)
    },
    [activeWorkspace, t]
  )

  // Start a fresh layout from the launch wizard: set the mode and spawn each chosen preset.
  const startLayout = useCallback(
    async ({ mode, presetIds }: LaunchConfig) => {
      setError(null)
      if (!activeWorkspace) {
        setError(t('error.noWorkspace'))
        return
      }
      const path = activeWorkspace.path
      setLayouts((prev) => ({ ...prev, [path]: mode }))
      const launched: AgentSession[] = []
      for (const id of presetIds) {
        const preset = presets.find((p) => p.id === id)
        if (!preset) continue
        const res = await window.api.startAgent({
          command: preset.command,
          label: preset.name,
          iconType: preset.iconType,
          icon: preset.icon,
          workspacePath: path
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
    [activeWorkspace, presets, t]
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
      if (!activePath) return
      setGridLayouts((prev) => ({ ...prev, [activePath]: layout }))
    },
    [activePath]
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
        const siblings = next.filter((s) => s.workspacePath === closed?.workspacePath)
        return siblings.length ? siblings[siblings.length - 1].id : null
      })
      return next
    })
  }, [])

  return (
    <div className="flex h-full flex-col bg-bar text-fg">
      <TitleBar showToggle={view === 'main'} onToggle={() => setSidebarCollapsed((c) => !c)} />

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
          />
        ) : (
          <>
            <Sidebar
              workspaces={workspaces}
              activePath={activePath}
              collapsed={sidebarCollapsed}
              onAdd={addWorkspace}
              onSelect={selectWorkspace}
              onRemove={removeWorkspace}
              onOpenSettings={() => {
                setSettingsSection('appearance')
                setView('settings')
              }}
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
                activePath={activePath}
                activeSessionId={activeSessionId}
                layoutMode={activePath ? layouts[activePath] : undefined}
                gridLayout={activePath ? gridLayouts[activePath] : undefined}
                presets={presets}
                onSelect={setActiveSessionId}
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
    </div>
  )
}
