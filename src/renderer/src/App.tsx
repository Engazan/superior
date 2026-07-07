import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { RightPanel } from './components/RightPanel'
import { FilePreviewPanel } from './components/FilePreviewPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { SettingsView, type SettingsSection } from './components/SettingsView'
import { QuickLaunch } from './components/QuickLaunch'
import { TerminalSearchOverlay } from './components/TerminalSearchOverlay'
import { CommandPalette } from './components/CommandPalette'
import { PromptPicker } from './components/PromptPicker'
import { insertIntoTerminal } from './terminalInput'
import type { Command } from './commands'
import { ProfileManager } from './components/ProfileManager'
import { OpenProjectModal } from './components/OpenProjectModal'
import { TooltipLayer } from './components/TooltipLayer'
import { useConfirm, useToast } from './components/ui'
import type { FsEntry, Integration } from './types'
import { ensureBus } from './terminalBus'
import { useI18n } from './i18n'
import { useShortcuts, eventToChord, formatChord, isRecordingShortcut } from './shortcuts'
import { overlayCount } from './overlayStack'
import { useGitStatus } from './hooks/useGitStatus'
import { useWorkspaceGitStats } from './hooks/useWorkspaceGitStats'
import { usePresets } from './hooks/usePresets'
import { useLayoutPresets } from './hooks/useLayoutPresets'
import { usePreviewPane } from './hooks/usePreviewPane'
import { useWorkspaceSessions } from './hooks/useWorkspaceSessions'
import { useTaskQueue } from './hooks/useTaskQueue'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import {
  setActivitySessions,
  setActivityActiveWorkspace,
  setActivityActiveSession,
  setActivityNotifier,
  useAttentionWorkspaces
} from './activityStore'

type View = 'main' | 'settings'

export default function App(): JSX.Element {
  const { t } = useI18n()
  const { shortcuts } = useShortcuts()
  const toast = useToast()

  const [error, setError] = useState<string | null>(null)
  // Errors reported by hooks/components surface as a sticky toast rather than
  // an inline banner, so they never shift the terminal layout.
  useEffect(() => {
    if (!error) return
    toast.error(error)
    setError(null)
  }, [error, toast])
  const [view, setView] = useState<View>('main')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Right-hand panel: fully hidden by default, toggled from the title bar.
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  // Quick-launch preset picker overlay (opened by shortcut).
  const [launcherOpen, setLauncherOpen] = useState(false)
  // Find-in-terminal overlay (⌘F), targeting the active session.
  const [searchOpen, setSearchOpen] = useState(false)
  // Command palette (⌘K) + the prompt picker it can spawn.
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palettePromptsOpen, setPalettePromptsOpen] = useState(false)
  // "Manage profiles" modal, opened from the title-bar profile switcher.
  const [profileManagerOpen, setProfileManagerOpen] = useState(false)
  // "Open / clone project" modal, opened from the sidebar.
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  // Set when "Add integration" was clicked inside the project modal, so leaving
  // settings returns to the modal instead of abandoning the clone flow.
  const [, setResumeProjectModal] = useState(false)

  // Saved git-forge integrations — drives the clone tab of the project modal.
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const reloadIntegrations = useCallback(() => {
    window.api.listIntegrations().then((s) => setIntegrations(s.integrations))
  }, [])
  useEffect(() => {
    reloadIntegrations()
  }, [reloadIntegrations])

  const presetsApi = usePresets()
  const { presets } = presetsApi
  const layoutPresets = useLayoutPresets()
  const preview = usePreviewPane()
  const confirm = useConfirm()

  // Unsaved-edit guard for the file preview: switching to another file or
  // closing the pane while the editor is dirty asks before discarding.
  const previewDirtyRef = useRef(false)
  const onPreviewDirtyChange = useCallback((dirty: boolean) => {
    previewDirtyRef.current = dirty
  }, [])
  const setPreviewFileGuarded = useCallback(
    async (file: FsEntry | null) => {
      if (previewDirtyRef.current) {
        const ok = await confirm({
          title: t('preview.unsavedTitle'),
          message: t('preview.unsavedConfirm'),
          confirmLabel: t('preview.discard'),
          tone: 'danger'
        })
        if (!ok) return
        previewDirtyRef.current = false
      }
      preview.setPreviewFile(file)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm, t, preview.setPreviewFile]
  )
  const ws = useWorkspaceSessions({ setError, t, presets })
  // The agent-task queue: persists in main, runs here (one task per folder at
  // a time, next starts when the previous task's terminal exits).
  const taskQueue = useTaskQueue({
    workspaces: ws.workspaces,
    activeWorkspaceId: ws.activeWorkspaceId,
    sessionsRestored: ws.sessionsRestored,
    sessions: ws.sessions,
    presets,
    applyState: ws.applyState,
    launchSessionIn: ws.launchSessionIn
  })
  // Jump to the workspace a task ran in (from the Tasks tab).
  const onJumpToTask = useCallback(
    (task: { workspaceId?: string }) => {
      if (task.workspaceId) void ws.selectWorkspace(task.workspaceId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.selectWorkspace]
  )
  // The active workspace's tabs + its active tab (drives the terminal grid).
  const activeTabs = ws.activeWorkspaceId ? ws.tabsByWs[ws.activeWorkspaceId] : undefined
  const activeTab = activeTabs?.tabs.find((tb) => tb.id === activeTabs.activeTabId)
  const { gitStatus, gitLoading, initializeGit, refresh: refreshGitStatus } = useGitStatus(
    ws.effectiveDir,
    ws.activeFolder?.path ?? null,
    setError
  )
  // Per-workspace +/- line counts shown beside each name in the sidebar.
  const workspaceGitStats = useWorkspaceGitStats(ws.workspaces)

  // Initialize the terminal data/exit bus once on mount.
  useEffect(() => {
    ensureBus()
  }, [])

  // Right-panel width in px, drag-resizable via the divider on its left edge.
  const [rightPanelWidth, setRightPanelWidth] = useState(384)
  const [rightResizing, setRightResizing] = useState(false)
  const startRightResize = useCallback((e: React.PointerEvent): void => {
    e.preventDefault()
    setRightResizing(true)
    let latest: number | null = null
    const move = (ev: PointerEvent): void => {
      latest = Math.min(560, Math.max(280, Math.round(window.innerWidth - ev.clientX)))
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

  // Restore the persisted sidebar layout once on mount; only after that do we
  // start persisting changes, so the initial defaults don't overwrite the store.
  const uiLoaded = useRef(false)
  useEffect(() => {
    window.api.getSettings().then((s) => {
      setSidebarCollapsed(s.ui.sidebarCollapsed)
      setRightSidebarOpen(s.ui.rightSidebarOpen)
      if (typeof s.ui.rightPanelWidth === 'number') setRightPanelWidth(s.ui.rightPanelWidth)
      uiLoaded.current = true
    })
  }, [])

  // Persist the sidebar layout whenever it changes (after the initial restore).
  useEffect(() => {
    if (!uiLoaded.current) return
    window.api.setUiState({ sidebarCollapsed, rightSidebarOpen })
  }, [sidebarCollapsed, rightSidebarOpen])

  // Tint the title bar + sidebar with the active profile's color, so the
  // switched-to profile is recognizable at a glance. (Terminal preset colors
  // tint each terminal's own topbar, not the app chrome.)
  const activeProfileColor =
    ws.profiles.find((p) => p.id === ws.activeProfileId)?.color ?? null

  // Live terminal signals (busy spinner, attention pulse) live in an external
  // store the sidebar subscribes to, so per-chunk activity never re-renders the
  // whole app. We only feed it the current session/workspace mapping.
  useEffect(() => {
    setActivitySessions(ws.sessions)
  }, [ws.sessions])
  useEffect(() => {
    setActivityActiveWorkspace(ws.activeWorkspaceId)
  }, [ws.activeWorkspaceId])
  useEffect(() => {
    setActivityActiveSession(ws.activeSessionId)
  }, [ws.activeSessionId])
  const update = useUpdateCheck()

  // Native OS notification when an agent finishes while the app is unfocused.
  // Names resolve through refs so the notifier callback never goes stale.
  const notifyCtxRef = useRef({ sessions: ws.sessions, workspaces: ws.workspaces, t })
  notifyCtxRef.current = { sessions: ws.sessions, workspaces: ws.workspaces, t }
  useEffect(() => {
    setActivityNotifier((sessionId, workspaceId) => {
      if (document.hasFocus()) return
      void window.api.getSettings().then((s) => {
        if (!s.notifications) return
        const ctx = notifyCtxRef.current
        const session = ctx.sessions.find((x) => x.id === sessionId)
        const workspace = ctx.workspaces.find((w) => w.id === workspaceId)
        const label = session
          ? session.nickname
            ? `${session.label} · ${session.nickname}`
            : session.label
          : 'Agent'
        window.api.notifyAgentFinished({
          workspaceId,
          title: ctx.t('notify.finishedTitle', { label }),
          body: ctx.t('notify.finishedBody', { workspace: workspace?.name ?? '' })
        })
      })
    })
    return () => setActivityNotifier(null)
  }, [])

  // Auto-launch a workspace's startup layout when it opens with no terminals.
  // Once per workspace per app run; surviving daemon sessions suppress it, so
  // an app restart never spawns duplicates next to restored terminals.
  const autoLaunchedRef = useRef(new Set<string>())
  useEffect(() => {
    if (!ws.sessionsRestored || view !== 'main') return
    const wsId = ws.activeWorkspaceId
    if (!wsId || autoLaunchedRef.current.has(wsId)) return
    const layoutId = ws.workspaces.find((w) => w.id === wsId)?.startupLayoutId
    if (!layoutId) return
    // Layouts may still be loading — retry on the next effect run; a deleted
    // layout id simply never matches and is ignored.
    const layout = layoutPresets.layouts.find((l) => l.id === layoutId)
    if (!layout) return
    if (ws.sessions.some((s) => s.workspaceId === wsId)) return
    autoLaunchedRef.current.add(wsId) // before the await — no double launch
    void ws.startLayout({
      presetIds: layout.presetIds.filter(Boolean),
      nicknames: layout.nicknames
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ws.sessionsRestored,
    ws.activeWorkspaceId,
    ws.workspaces,
    ws.sessions,
    layoutPresets.layouts,
    view
  ])

  // Clicking the notification selects the workspace the agent finished in.
  const selectWorkspaceRef = useRef(ws.selectWorkspace)
  selectWorkspaceRef.current = ws.selectWorkspace
  useEffect(
    () => window.api.onNotificationActivated((id) => selectWorkspaceRef.current(id)),
    []
  )

  const openPresets = useCallback(() => {
    setSettingsSection('presets')
    setView('settings')
  }, [])

  // Single exit path from settings — shared by the Back button, the ⌘, toggle
  // and Escape — so the interrupted "clone from git" flow always resumes.
  const closeSettings = useCallback(() => {
    setView('main')
    setResumeProjectModal((resume) => {
      if (resume) setProjectModalOpen(true)
      return false
    })
  }, [])

  const openProjectModal = useCallback(() => setProjectModalOpen(true), [])
  // Stable reference — Sidebar is memoized, an inline arrow would defeat it.
  const expandSidebar = useCallback(() => setSidebarCollapsed(false), [])

  // ⌘K command registry — every currently actionable thing, rebuilt from live
  // state. Terminal/git-scoped entries appear only when their target exists.
  const paletteCommands = useMemo<Command[]>(() => {
    const cmds: Command[] = []
    const folderName = (path: string): string =>
      ws.folders.find((f) => f.path === path)?.displayName?.trim() ||
      ws.folders.find((f) => f.path === path)?.name ||
      ''

    for (const w of ws.workspaces) {
      cmds.push({
        id: `ws:${w.id}`,
        title: `${folderName(w.folderPath)} / ${w.name}`,
        keywords: w.branch ?? '',
        section: t('palette.sectionWorkspaces'),
        run: () => ws.selectWorkspace(w.id)
      })
    }
    for (const p of ws.profiles) {
      if (p.id === ws.activeProfileId) continue
      cmds.push({
        id: `profile:${p.id}`,
        title: `${t('profile.switch')}: ${p.name}`,
        section: t('palette.sectionProfiles'),
        run: () => ws.selectProfile(p.id)
      })
    }
    if (ws.activeWorkspaceId) {
      for (const p of presets.filter((x) => x.active)) {
        cmds.push({
          id: `preset:${p.id}`,
          title: `${t('terminal.addTerminal')}: ${p.name}`,
          keywords: p.command,
          section: t('palette.sectionTerminals'),
          run: () => void ws.launchAgent(p)
        })
      }
      for (const layout of layoutPresets.layouts) {
        cmds.push({
          id: `layout:${layout.id}`,
          title: `${t('launcher.start')}: ${layout.name}`,
          section: t('palette.sectionTerminals'),
          run: () =>
            void ws.startLayout({
              presetIds: layout.presetIds.filter(Boolean),
              nicknames: layout.nicknames
            })
        })
      }
    }
    if (ws.activeSessionId) {
      cmds.push({
        id: 'prompt:insert',
        title: t('prompts.insert'),
        section: t('palette.sectionTerminals'),
        run: () => setPalettePromptsOpen(true)
      })
      cmds.push({
        id: 'terminal:search',
        title: t('keyboard.searchTerminal'),
        section: t('palette.sectionTerminals'),
        hint: formatChord(shortcuts.searchTerminal),
        run: () => setSearchOpen(true)
      })
    }
    if (ws.effectiveDir) {
      const dir = ws.effectiveDir
      cmds.push(
        {
          id: 'git:push',
          title: t('changes.push'),
          keywords: 'git push',
          section: t('palette.sectionGit'),
          run: () =>
            void window.api.gitPush(dir).then((r) => {
              if (r.error) toast.error(r.error)
              else toast.success(t('changes.pushed'))
            })
        },
        {
          id: 'git:pull',
          title: t('changes.pull'),
          keywords: 'git pull',
          section: t('palette.sectionGit'),
          run: () =>
            void window.api.gitPull(dir).then((r) => {
              if (r.error) toast.error(r.error)
              else toast.success(t('changes.pulled'))
            })
        }
      )
    }
    cmds.push(
      {
        id: 'view:sidebar',
        title: t('keyboard.toggleSidebar'),
        section: t('palette.sectionView'),
        hint: formatChord(shortcuts.toggleSidebar),
        run: () => setSidebarCollapsed((c) => !c)
      },
      {
        id: 'view:right',
        title: t('keyboard.toggleRightPanel'),
        section: t('palette.sectionView'),
        hint: formatChord(shortcuts.toggleRightPanel),
        run: () => setRightSidebarOpen((o) => !o)
      },
      // Open project is always available — it's the only recovery action when
      // nothing is open yet; Manage profiles likewise had no palette entry.
      {
        id: 'project:open',
        title: t('sidebar.openProject'),
        keywords: 'open clone project folder',
        section: t('palette.sectionView'),
        run: () => setProjectModalOpen(true)
      },
      {
        id: 'profiles:manage',
        title: t('profile.manageTitle'),
        section: t('palette.sectionProfiles'),
        hint: formatChord(shortcuts.manageProfiles),
        run: () => setProfileManagerOpen(true)
      }
    )
    if (ws.activeWorkspaceId) {
      cmds.push({
        id: 'view:launcher',
        title: t('keyboard.openLauncher'),
        section: t('palette.sectionView'),
        hint: formatChord(shortcuts.openLauncher),
        run: () => setLauncherOpen(true)
      })
    }
    if (update.info?.updateAvailable) {
      cmds.push({
        id: 'update:install',
        title:
          update.progress.phase === 'downloaded'
            ? t('update.restart')
            : `${t('update.action')}: ${t('update.available', {
                version: update.info.latestVersion ?? ''
              })}`,
        keywords: 'update upgrade version install',
        section: t('palette.sectionView'),
        run: () =>
          update.progress.phase === 'downloaded'
            ? update.installAndRestart()
            : update.startDownload()
      })
    }
    const sections: { id: SettingsSection; label: string }[] = [
      { id: 'appearance', label: t('settings.appearance') },
      { id: 'integrations', label: t('settings.integrations') },
      { id: 'presets', label: t('settings.terminalPresets') },
      { id: 'prompts', label: t('settings.prompts') },
      { id: 'daemons', label: t('settings.daemons') },
      { id: 'keyboard', label: t('settings.keyboard') },
      { id: 'shell', label: t('settings.shellCommand') }
    ]
    for (const s of sections) {
      cmds.push({
        id: `settings:${s.id}`,
        title: `${t('sidebar.settings')}: ${s.label}`,
        section: t('palette.sectionSettings'),
        run: () => {
          setSettingsSection(s.id)
          setView('settings')
        }
      })
    }
    return cmds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ws.workspaces,
    ws.folders,
    ws.profiles,
    ws.activeProfileId,
    ws.activeWorkspaceId,
    ws.activeSessionId,
    ws.effectiveDir,
    presets,
    layoutPresets.layouts,
    shortcuts,
    update.info,
    update.progress.phase,
    t
  ])

  // Stable tab handlers for the terminal panel (they close over the active workspace).
  const { activeWorkspaceId, selectTab, addTab, closeTab, renameTab } = ws
  const onSelectTab = useCallback(
    (id: string) => activeWorkspaceId && selectTab(activeWorkspaceId, id),
    [activeWorkspaceId, selectTab]
  )
  const onAddTab = useCallback(
    () => activeWorkspaceId && addTab(activeWorkspaceId),
    [activeWorkspaceId, addTab]
  )
  const onCloseTab = useCallback(
    (id: string) => activeWorkspaceId && closeTab(activeWorkspaceId, id),
    [activeWorkspaceId, closeTab]
  )
  const onRenameTab = useCallback(
    (id: string, name: string) => activeWorkspaceId && renameTab(activeWorkspaceId, id, name),
    [activeWorkspaceId, renameTab]
  )

  // Global keyboard shortcuts. Capture phase so they win over a focused terminal;
  // suppressed while a binding is being recorded in settings.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat || isRecordingShortcut()) return
      // While any overlay is open (palette, launcher, modals, menus…), global
      // chords must not reach through it — ⌘W behind a modal would kill the
      // focused terminal. Only "toggle palette closed" stays live; each overlay
      // handles its own Escape.
      const appOverlayOpen =
        launcherOpen ||
        searchOpen ||
        paletteOpen ||
        palettePromptsOpen ||
        projectModalOpen ||
        profileManagerOpen
      const anyOverlayOpen = appOverlayOpen || overlayCount() > 0
      if (anyOverlayOpen) {
        const chord = eventToChord(e)
        if (chord && chord === shortcuts.openPalette && paletteOpen) {
          e.preventDefault()
          e.stopPropagation()
          setPaletteOpen(false)
        }
        return
      }
      // Escape leaves settings (mouse-only Back button otherwise).
      if (e.key === 'Escape' && view === 'settings') {
        e.preventDefault()
        closeSettings()
        return
      }
      if (
        e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        /^[1-9]$/.test(e.key) &&
        view === 'main' &&
        ws.focusGridCell(Number(e.key) - 1)
      ) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      const chord = eventToChord(e)
      if (!chord) return
      if (chord === shortcuts.toggleSidebar) {
        if (view !== 'main') return
        e.preventDefault()
        e.stopPropagation()
        setSidebarCollapsed((c) => !c)
      } else if (chord === shortcuts.openSettings) {
        e.preventDefault()
        e.stopPropagation()
        if (view === 'settings') closeSettings()
        else setView('settings')
      } else if (chord === shortcuts.maximizeFocusedCell) {
        if (view !== 'main') return
        e.preventDefault()
        e.stopPropagation()
        ws.toggleMaximizeFocused()
      } else if (chord === shortcuts.openLauncher) {
        if (view !== 'main' || !ws.activeWorkspaceId) return
        e.preventDefault()
        e.stopPropagation()
        setLauncherOpen(true)
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
        void setPreviewFileGuarded(null)
      } else if (chord === shortcuts.prevTerminal) {
        if (view !== 'main' || !ws.cycleSession(-1)) return
        e.preventDefault()
        e.stopPropagation()
      } else if (chord === shortcuts.nextTerminal) {
        if (view !== 'main' || !ws.cycleSession(1)) return
        e.preventDefault()
        e.stopPropagation()
      } else if (chord === shortcuts.openFolder) {
        if (view !== 'main') return
        e.preventDefault()
        e.stopPropagation()
        void ws.addFolder()
      } else if (chord === shortcuts.prevWorkspace) {
        if (view !== 'main' || !ws.cycleWorkspace(-1)) return
        e.preventDefault()
        e.stopPropagation()
      } else if (chord === shortcuts.nextWorkspace) {
        if (view !== 'main' || !ws.cycleWorkspace(1)) return
        e.preventDefault()
        e.stopPropagation()
      } else if (chord === shortcuts.prevProfile) {
        if (view !== 'main' || !ws.cycleProfile(-1)) return
        e.preventDefault()
        e.stopPropagation()
      } else if (chord === shortcuts.nextProfile) {
        if (view !== 'main' || !ws.cycleProfile(1)) return
        e.preventDefault()
        e.stopPropagation()
      } else if (chord === shortcuts.manageProfiles) {
        if (view !== 'main') return
        e.preventDefault()
        e.stopPropagation()
        setProfileManagerOpen((o) => !o)
      } else if (chord === shortcuts.searchTerminal) {
        if (view !== 'main' || !ws.activeSessionId) return
        // Focus inside the file preview → ⌘F belongs to its own find panel.
        if (document.activeElement?.closest('[data-preview-panel]')) return
        e.preventDefault()
        e.stopPropagation()
        setSearchOpen(true)
      } else if (chord === shortcuts.openPalette) {
        e.preventDefault()
        e.stopPropagation()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    shortcuts,
    view,
    launcherOpen,
    searchOpen,
    paletteOpen,
    palettePromptsOpen,
    projectModalOpen,
    profileManagerOpen,
    closeSettings,
    ws.activeWorkspaceId,
    ws.activeSessionId,
    ws.focusGridCell,
    ws.toggleMaximizeFocused,
    ws.closeSession,
    ws.cycleSession,
    ws.addFolder,
    ws.cycleWorkspace,
    ws.cycleProfile,
    preview.previewFile,
    setPreviewFileGuarded
  ])

  return (
    <div className="flex h-full flex-col bg-bar text-fg">
      <TitleBar
        showToggle={view === 'main'}
        gitStatus={view === 'main' ? gitStatus : null}
        gitLoading={gitLoading}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        onInitGit={initializeGit}
        gitDir={ws.effectiveDir}
        branchSwitchable={
          view === 'main' && !!gitStatus?.isRepository && !ws.activeWorkspace?.worktreePath
        }
        onBranchSwitched={refreshGitStatus}
        launcherEnabled={view === 'main' && !!ws.activeWorkspaceId}
        onOpenLauncher={() => {
          if (view === 'main' && ws.activeWorkspaceId) setLauncherOpen(true)
        }}
        onToggleRight={() => setRightSidebarOpen((o) => !o)}
        rightOpen={rightSidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        profiles={ws.profiles}
        activeProfileId={ws.activeProfileId}
        onSelectProfile={ws.selectProfile}
        onManageProfiles={() => setProfileManagerOpen(true)}
        tintColor={activeProfileColor}
      />

      <div className="flex min-h-0 flex-1">
        {view === 'settings' ? (
          <SettingsView
            initialSection={settingsSection}
            onSectionChange={setSettingsSection}
            onBack={closeSettings}
            onIntegrationsChanged={reloadIntegrations}
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
              tintColor={activeProfileColor}
              folders={ws.visibleFolders}
              workspaces={ws.workspaces}
              activeWorkspaceId={ws.activeWorkspaceId}
              counts={ws.counts}
              gitStats={workspaceGitStats}
              update={update}
              collapsed={sidebarCollapsed}
              onExpand={expandSidebar}
              onOpenProject={openProjectModal}
              // Reopens on the last-visited section rather than resetting to Appearance.
              onOpenSettings={() => setView('settings')}
              onRemoveFolder={ws.removeFolder}
              onReorderFolders={ws.reorderFolders}
              onUpdateFolder={ws.updateFolder}
              onAddWorkspace={ws.addWorkspace}
              onAddWorktreeWorkspace={ws.addWorktreeWorkspace}
              onRenameWorkspace={ws.renameWorkspace}
              onRemoveWorkspace={ws.removeWorkspace}
              onSelectWorkspace={ws.selectWorkspace}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div ref={preview.previewRowRef} className="flex min-h-0 min-w-0 flex-1">
                <div className="flex min-h-0 min-w-0 flex-1">
                  <TerminalPanel
                    sessions={ws.sessions}
                    activeWorkspaceId={ws.activeWorkspaceId}
                    workingDir={ws.effectiveDir}
                    layoutPresets={layoutPresets.layouts}
                    startupLayoutId={ws.activeWorkspace?.startupLayoutId}
                    onSetStartupLayout={(layoutId) => {
                      if (ws.activeWorkspaceId) void ws.setStartupLayout(ws.activeWorkspaceId, layoutId)
                    }}
                    onSaveLayoutPreset={layoutPresets.saveLayout}
                    onDeleteLayoutPreset={layoutPresets.deleteLayout}
                    activeSessionId={ws.activeSessionId}
                    maximizedId={ws.maximizedId}
                    tabs={activeTabs?.tabs ?? []}
                    activeTabId={activeTabs?.activeTabId}
                    gridLayout={activeTab?.gridLayout}
                    presets={presets}
                    onSelect={ws.setActiveSessionId}
                    onToggleMaximize={ws.toggleMaximize}
                    onClose={ws.closeSession}
                    onRestart={ws.restartSession}
                    onSessionUpdate={ws.updateSession}
                    onSetNickname={ws.setSessionNickname}
                    onStart={ws.startLayout}
                    onLaunch={ws.launchAgent}
                    onManagePresets={openPresets}
                    onOpenProject={openProjectModal}
                    onGridLayoutChange={ws.setGridLayout}
                    onSelectTab={onSelectTab}
                    onAddTab={onAddTab}
                    onCloseTab={onCloseTab}
                    onRenameTab={onRenameTab}
                  />
                </div>

                {preview.previewFile && (
                  <>
                    <div
                      onPointerDown={preview.startPreviewResize}
                      className="group flex w-1.5 shrink-0 cursor-col-resize items-stretch"
                    >
                      <span className="w-full bg-edge transition group-hover:bg-accent" />
                    </div>
                    <div
                      className="flex min-h-0 min-w-[280px] shrink-0 flex-col"
                      style={{ width: `${preview.previewWidth * 100}%` }}
                    >
                      <FilePreviewPanel
                        file={preview.previewFile}
                        onClose={() => void setPreviewFileGuarded(null)}
                        onDirtyChange={onPreviewDirtyChange}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Drag handle for the right panel — same pattern as the preview divider. */}
            {rightSidebarOpen && (
              <div
                onPointerDown={startRightResize}
                className="group flex w-1.5 shrink-0 cursor-col-resize items-stretch"
              >
                <span className="w-full bg-edge transition group-hover:bg-accent" />
              </div>
            )}
            {/* Always mounted so the width can animate; the inner panel keeps its
                fixed width and is clipped while collapsed. Transition disabled
                while dragging so the resize tracks the pointer. */}
            <div
              style={{ width: rightSidebarOpen ? rightPanelWidth : 0 }}
              className={`flex shrink-0 overflow-hidden ${
                rightResizing ? '' : 'transition-[width] duration-200 ease-out'
              }`}
            >
              <RightPanel
                width={rightPanelWidth}
                active={rightSidebarOpen}
                folderPath={ws.effectiveDir}
                tasksFolder={ws.activeFolder?.path ?? null}
                taskQueue={taskQueue}
                presets={presets}
                onJumpToTask={onJumpToTask}
                onOpenFile={(file) => void setPreviewFileGuarded(file)}
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
          onManagePresets={openPresets}
        />
      )}

      {view === 'main' && searchOpen && ws.activeSessionId && (
        <TerminalSearchOverlay
          sessionId={ws.activeSessionId}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {paletteOpen && (
        <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      )}

      {palettePromptsOpen && ws.activeSessionId && (
        <PromptPicker
          onPick={(p, submit) => {
            if (ws.activeSessionId) insertIntoTerminal(ws.activeSessionId, p.text, submit)
          }}
          onClose={() => setPalettePromptsOpen(false)}
        />
      )}

      {projectModalOpen && (
        <OpenProjectModal
          integrations={integrations}
          onOpenFolder={ws.addFolder}
          onClone={ws.cloneRepository}
          onAddIntegration={() => {
            setProjectModalOpen(false)
            setResumeProjectModal(true)
            setSettingsSection('integrations')
            setView('settings')
          }}
          onClose={() => setProjectModalOpen(false)}
        />
      )}

      {profileManagerOpen && (
        <ProfileManager
          profiles={ws.profiles}
          activeProfileId={ws.activeProfileId}
          onAdd={ws.addProfile}
          onRename={ws.renameProfile}
          onUpdateColor={(id, color) => ws.updateProfile(id, { color })}
          onRemove={ws.removeProfile}
          onClose={() => setProfileManagerOpen(false)}
        />
      )}

      <AttentionBadgeSync />
      <TooltipLayer />
    </div>
  )
}

/**
 * Mirrors the attention-workspace count onto the dock/taskbar badge. A separate
 * null-rendering subscriber so attention changes never re-render App itself.
 */
function AttentionBadgeSync(): null {
  const attention = useAttentionWorkspaces()
  useEffect(() => {
    window.api.setBadgeCount(attention.size)
  }, [attention])
  return null
}
