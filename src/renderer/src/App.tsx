import { useCallback, useEffect, useMemo, useState } from 'react'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { AgentButtons } from './components/AgentButtons'
import { TerminalPanel } from './components/TerminalPanel'
import { SettingsView } from './components/SettingsView'
import { ensureBus } from './terminalBus'
import type { AgentSession, AgentType, Workspace, WorkspaceState } from './types'

type View = 'main' | 'settings'

export default function App(): JSX.Element {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('main')

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.path === activePath) ?? null,
    [workspaces, activePath]
  )

  // Restore saved workspaces + start listening to the agent event stream once.
  useEffect(() => {
    ensureBus()
    window.api.listWorkspaces().then((state) => {
      setWorkspaces(state.workspaces)
      setActivePath(state.activePath)
    })
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
    async (agent: AgentType) => {
      setError(null)
      if (!activeWorkspace) {
        setError('No workspace selected. Add or select a folder first.')
        return
      }
      const res = await window.api.startAgent(agent, activeWorkspace.path)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSessions((prev) => [...prev, res.session])
      setActiveSessionId(res.session.id)
    },
    [activeWorkspace]
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
      <TopBar activeWorkspace={activeWorkspace} />

      {view === 'settings' ? (
        <SettingsView onBack={() => setView('main')} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar
            workspaces={workspaces}
            activePath={activePath}
            onAdd={addWorkspace}
            onSelect={selectWorkspace}
            onRemove={removeWorkspace}
            onOpenSettings={() => setView('settings')}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-3 border-b border-edge bg-bar px-4 py-3">
              <AgentButtons disabled={!activeWorkspace} onLaunch={launchAgent} />
            </div>

            {error && (
              <div className="flex items-start justify-between gap-4 border-b border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-200">
                <span>{error}</span>
                <button
                  className="shrink-0 text-red-300/80 hover:text-red-100"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}

            <TerminalPanel
              sessions={sessions}
              activePath={activePath}
              activeSessionId={activeSessionId}
              onSelect={setActiveSessionId}
              onClose={closeSession}
              onSessionUpdate={updateSession}
            />
          </div>
        </div>
      )}
    </div>
  )
}
