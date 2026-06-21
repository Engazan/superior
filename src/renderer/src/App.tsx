import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { RightPanel } from './components/RightPanel'
import { FilePreviewPanel } from './components/FilePreviewPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { SettingsView, type SettingsSection } from './components/SettingsView'
import { QuickLaunch } from './components/QuickLaunch'
import { ensureBus } from './terminalBus'
import { useI18n } from './i18n'
import { useShortcuts, eventToChord, isRecordingShortcut } from './shortcuts'
import { useGitStatus } from './hooks/useGitStatus'
import { usePresets } from './hooks/usePresets'
import { usePreviewPane } from './hooks/usePreviewPane'
import { useWorkspaceSessions } from './hooks/useWorkspaceSessions'
import { useTerminalActivity } from './hooks/useTerminalActivity'
import { useAttentionColor } from './attentionColor'

type View = 'main' | 'settings'

export default function App(): JSX.Element {
  const { t } = useI18n()
  const { shortcuts } = useShortcuts()

  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('main')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Right-hand panel: fully hidden by default, toggled from the title bar.
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  // Quick-launch preset picker overlay (opened by shortcut).
  const [launcherOpen, setLauncherOpen] = useState(false)

  const presetsApi = usePresets()
  const { presets } = presetsApi
  const preview = usePreviewPane()
  const ws = useWorkspaceSessions({ setError, t, presets })
  const { gitStatus, gitLoading, initializeGit } = useGitStatus(
    ws.effectiveDir,
    ws.activeFolder?.path ?? null,
    setError
  )

  // Initialize the terminal data/exit bus once on mount.
  useEffect(() => {
    ensureBus()
  }, [])

  // Restore the persisted sidebar layout once on mount; only after that do we
  // start persisting changes, so the initial defaults don't overwrite the store.
  const uiLoaded = useRef(false)
  useEffect(() => {
    window.api.getSettings().then((s) => {
      setSidebarCollapsed(s.ui.sidebarCollapsed)
      setRightSidebarOpen(s.ui.rightSidebarOpen)
      uiLoaded.current = true
    })
  }, [])

  // Persist the sidebar layout whenever it changes (after the initial restore).
  useEffect(() => {
    if (!uiLoaded.current) return
    window.api.setUiState({ sidebarCollapsed, rightSidebarOpen })
  }, [sidebarCollapsed, rightSidebarOpen])

  // Tint the top bar with the active session's preset color.
  const activeSessionColor =
    ws.sessions.find((s) => s.id === ws.activeSessionId)?.color ?? null

  // Live terminal signals: `busy` drives the "working" spinner, `attention`
  // pulses the tab of a workspace whose terminal finished while unfocused.
  const { busy: busySessions, attention: attentionWorkspaceIds } = useTerminalActivity(
    ws.sessions,
    ws.activeWorkspaceId
  )
  const { attentionColor } = useAttentionColor()
  const busyWorkspaceIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of ws.sessions) {
      if (s.status === 'running' && busySessions.has(s.id)) set.add(s.workspaceId)
    }
    return set
  }, [ws.sessions, busySessions])

  const openPresets = useCallback(() => {
    setSettingsSection('presets')
    setView('settings')
  }, [])

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
        view === 'main' &&
        !launcherOpen &&
        ws.focusGridCell(Number(e.key) - 1)
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
        ws.toggleMaximizeFocused()
      } else if (chord === shortcuts.openLauncher) {
        if (view !== 'main') return
        e.preventDefault()
        e.stopPropagation()
        setLauncherOpen((o) => !o && !!ws.activeWorkspaceId)
      } else if (chord === shortcuts.toggleRightPanel) {
        if (view !== 'main') return
        e.preventDefault()
        e.stopPropagation()
        setRightSidebarOpen((o) => !o)
      } else if (chord === shortcuts.closeFocusedCell) {
        if (view !== 'main' || !ws.activeSessionId) return
        e.preventDefault()
        e.stopPropagation()
        ws.closeSession(ws.activeSessionId)
      } else if (chord === shortcuts.closePreview) {
        if (view !== 'main' || !preview.previewFile) return
        e.preventDefault()
        e.stopPropagation()
        preview.setPreviewFile(null)
      } else if (chord === shortcuts.prevTerminal) {
        if (view !== 'main' || launcherOpen || !ws.cycleSession(-1)) return
        e.preventDefault()
        e.stopPropagation()
      } else if (chord === shortcuts.nextTerminal) {
        if (view !== 'main' || launcherOpen || !ws.cycleSession(1)) return
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    shortcuts,
    view,
    launcherOpen,
    ws.activeWorkspaceId,
    ws.activeSessionId,
    ws.focusGridCell,
    ws.toggleMaximizeFocused,
    ws.closeSession,
    ws.cycleSession,
    preview.previewFile,
    preview.setPreviewFile
  ])

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
        onToggleRight={() => setRightSidebarOpen((o) => !o)}
        activeColor={activeSessionColor}
      />

      <div className="flex min-h-0 flex-1">
        {view === 'settings' ? (
          <SettingsView
            initialSection={settingsSection}
            onBack={() => setView('main')}
            presets={presets}
            onSavePreset={presetsApi.savePreset}
            onDeletePreset={presetsApi.deletePreset}
            onReorderPresets={presetsApi.reorderPresets}
            onTogglePresetActive={presetsApi.togglePresetActive}
            onPickPresetImage={() => window.api.pickPresetImage()}
            onPresetsChanged={(state) => presetsApi.setPresets(state.presets)}
            workspaces={ws.workspaces}
            folders={ws.folders}
            onKillSession={ws.closeSession}
          />
        ) : (
          <>
            <Sidebar
              folders={ws.folders}
              workspaces={ws.workspaces}
              activeWorkspaceId={ws.activeWorkspaceId}
              counts={ws.counts}
              busyWorkspaceIds={busyWorkspaceIds}
              attentionWorkspaceIds={attentionWorkspaceIds}
              attentionColor={attentionColor}
              collapsed={sidebarCollapsed}
              onAddFolder={ws.addFolder}
              onRemoveFolder={ws.removeFolder}
              onAddWorkspace={ws.addWorkspace}
              onAddWorktreeWorkspace={ws.addWorktreeWorkspace}
              onRenameWorkspace={ws.renameWorkspace}
              onRemoveWorkspace={ws.removeWorkspace}
              onSelectWorkspace={ws.selectWorkspace}
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

              <div ref={preview.previewRowRef} className="flex min-h-0 min-w-0 flex-1">
                <div className="flex min-h-0 min-w-0 flex-1">
                  <TerminalPanel
                    sessions={ws.sessions}
                    activeWorkspaceId={ws.activeWorkspaceId}
                    activeSessionId={ws.activeSessionId}
                    maximizedId={ws.maximizedId}
                    layoutMode={ws.activeWorkspaceId ? ws.layouts[ws.activeWorkspaceId] : undefined}
                    gridLayout={ws.activeWorkspaceId ? ws.gridLayouts[ws.activeWorkspaceId] : undefined}
                    presets={presets}
                    onSelect={ws.setActiveSessionId}
                    onToggleMaximize={ws.toggleMaximize}
                    onClose={ws.closeSession}
                    onSessionUpdate={ws.updateSession}
                    onStart={ws.startLayout}
                    onLaunch={ws.launchAgent}
                    onManagePresets={openPresets}
                    onGridLayoutChange={ws.setGridLayout}
                  />
                </div>

                {preview.previewFile && (
                  <>
                    <div
                      onPointerDown={preview.startPreviewResize}
                      className="group flex w-1.5 shrink-0 cursor-col-resize items-stretch"
                    >
                      <span className="w-full bg-edge transition group-hover:bg-sky-500" />
                    </div>
                    <div
                      className="flex min-h-0 min-w-[280px] shrink-0 flex-col"
                      style={{ width: `${preview.previewWidth * 100}%` }}
                    >
                      <FilePreviewPanel
                        file={preview.previewFile}
                        onClose={() => preview.setPreviewFile(null)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Always mounted so the width can animate; the inner panel keeps its
                fixed width and is clipped while collapsed. */}
            <div
              className={`flex shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
                rightSidebarOpen ? 'w-96' : 'w-0'
              }`}
            >
              <RightPanel
                active={rightSidebarOpen}
                folderPath={ws.effectiveDir}
                onOpenFile={preview.setPreviewFile}
                selectedPath={preview.previewFile?.path ?? null}
              />
            </div>
          </>
        )}
      </div>

      {view === 'main' && launcherOpen && (
        <QuickLaunch
          presets={presets.filter((p) => p.active)}
          onSelect={ws.launchAgent}
          onClose={() => setLauncherOpen(false)}
        />
      )}
    </div>
  )
}
