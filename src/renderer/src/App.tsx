import { useCallback, useEffect, useState } from 'react'
import { TopBar } from './components/TopBar'
import { WorkspaceSelector } from './components/WorkspaceSelector'
import { AgentButtons } from './components/AgentButtons'
import { TerminalPanel } from './components/TerminalPanel'
import { ensureBus } from './terminalBus'
import type { AgentSession, AgentType, Workspace } from './types'

export default function App(): JSX.Element {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Restore last workspace + start listening to the agent event stream once.
  useEffect(() => {
    ensureBus()
    window.api.getLastWorkspace().then((ws) => {
      if (ws) setWorkspace(ws)
    })
  }, [])

  const openWorkspace = useCallback(async () => {
    setError(null)
    const res = await window.api.openWorkspace()
    if ('error' in res) {
      setError(res.error)
      return
    }
    if (res.workspace) setWorkspace(res.workspace)
  }, [])

  const launchAgent = useCallback(
    async (agent: AgentType) => {
      setError(null)
      if (!workspace) {
        setError('No workspace selected. Open a folder first.')
        return
      }
      const res = await window.api.startAgent(agent, workspace.path)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSessions((prev) => [...prev, res.session])
      setActiveSessionId(res.session.id)
    },
    [workspace]
  )

  const updateSession = useCallback((id: string, patch: Partial<AgentSession>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const closeSession = useCallback(
    (id: string) => {
      window.api.killAgent(id)
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id)
        setActiveSessionId((curr) =>
          curr === id ? (next.length ? next[next.length - 1].id : null) : curr
        )
        return next
      })
    },
    []
  )

  return (
    <div className="flex h-full flex-col bg-bar text-[#cdd6f4]">
      <TopBar workspace={workspace} />

      <div className="flex items-center gap-3 border-b border-edge bg-bar px-4 py-3">
        <WorkspaceSelector workspace={workspace} onOpen={openWorkspace} />
        <div className="mx-1 h-6 w-px bg-edge" />
        <AgentButtons disabled={!workspace} onLaunch={launchAgent} />
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
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onClose={closeSession}
        onSessionUpdate={updateSession}
      />
    </div>
  )
}
