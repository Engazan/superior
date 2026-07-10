import { useCallback, useEffect, useRef, useState } from 'react'
import type { SettingsSection } from '../components/SettingsView'

export type AppView = 'main' | 'settings'

/**
 * Owns renderer-only shell state: views, overlays and persisted pane layout.
 * Feature state (workspaces, terminals, presets and previews) stays in its
 * respective domain hook, leaving App to compose those domains.
 */
export function useAppUiState() {
  const [view, setView] = useState<AppView>('main')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [rightPanelLoaded, setRightPanelLoaded] = useState(false)
  const [rightPanelWidth, setRightPanelWidth] = useState(384)
  const [rightResizing, setRightResizing] = useState(false)
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palettePromptsOpen, setPalettePromptsOpen] = useState(false)
  const [profileManagerOpen, setProfileManagerOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [, setResumeProjectModal] = useState(false)

  // Avoid loading the Git/file/task feature bundle until it is first requested,
  // then keep it mounted so closing the panel preserves its local UI state.
  useEffect(() => {
    if (rightSidebarOpen) setRightPanelLoaded(true)
  }, [rightSidebarOpen])

  // Restore the persisted shell layout once; only after that do we persist
  // changes, so initial defaults never overwrite the stored values.
  const uiLoaded = useRef(false)
  useEffect(() => {
    void window.api.getSettings().then((settings) => {
      setSidebarCollapsed(settings.ui.sidebarCollapsed)
      setRightSidebarOpen(settings.ui.rightSidebarOpen)
      if (typeof settings.ui.rightPanelWidth === 'number') {
        setRightPanelWidth(settings.ui.rightPanelWidth)
      }
      uiLoaded.current = true
    })
  }, [])

  useEffect(() => {
    if (!uiLoaded.current) return
    void window.api.setUiState({ sidebarCollapsed, rightSidebarOpen })
  }, [sidebarCollapsed, rightSidebarOpen])

  const startRightResize = useCallback((e: React.PointerEvent): void => {
    e.preventDefault()
    setRightResizing(true)
    let latest: number | null = null
    const move = (event: PointerEvent): void => {
      latest = Math.min(560, Math.max(280, Math.round(window.innerWidth - event.clientX)))
      setRightPanelWidth(latest)
    }
    const up = (): void => {
      setRightResizing(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (latest !== null) void window.api.setUiState({ rightPanelWidth: latest })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  // Single exit path from settings so the interrupted project-clone flow
  // reliably returns to its modal.
  const closeSettings = useCallback(() => {
    setView('main')
    setResumeProjectModal((resume) => {
      if (resume) setProjectModalOpen(true)
      return false
    })
  }, [])

  return {
    view,
    setView,
    settingsSection,
    setSettingsSection,
    sidebarCollapsed,
    setSidebarCollapsed,
    rightSidebarOpen,
    setRightSidebarOpen,
    rightPanelLoaded,
    rightPanelWidth,
    rightResizing,
    startRightResize,
    launcherOpen,
    setLauncherOpen,
    searchOpen,
    setSearchOpen,
    paletteOpen,
    setPaletteOpen,
    palettePromptsOpen,
    setPalettePromptsOpen,
    profileManagerOpen,
    setProfileManagerOpen,
    projectModalOpen,
    setProjectModalOpen,
    setResumeProjectModal,
    closeSettings
  }
}
