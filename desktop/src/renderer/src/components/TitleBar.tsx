import { WORKSPACE_MODES, type WorkspaceMode } from '../codeWorkspace'
import { WindowControls } from './WindowControls'
import { SidebarToggle } from './SidebarToggle'
import { ProfileSwitcher } from './ProfileSwitcher'
import { BranchSwitcher } from './BranchSwitcher'
import { AgentIcon, BranchIcon, BroadcastIcon, ChatIcon, CodeIcon, DashboardIcon, GlobeIcon, PlusIcon, PromptIcon, SearchIcon } from './ui'
import { useI18n } from '../i18n'
import { formatChord, useShortcuts, useShortcutTitle } from '../shortcuts'
import { barTint } from '../tint'
import type { GitStatus, Profile } from '../types'

const isMac = window.api.platform === 'darwin'

const MODE_ICONS = {
  terminals: AgentIcon,
  code: CodeIcon,
  browser: GlobeIcon,
  chat: ChatIcon,
  dashboard: DashboardIcon
} satisfies Record<WorkspaceMode, typeof AgentIcon>

/** Every titlebar icon button shares one 32px height, width, radius and focus ring. */
const TB_BTN =
  'app-no-drag grid h-8 w-8 shrink-0 place-items-center rounded-lg p-0 transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent'

interface Props {
  workspaceMode: WorkspaceMode
  /** Modes left on in settings; the switcher hides when only the CLI remains. */
  workspaceModes?: readonly WorkspaceMode[]
  onWorkspaceModeChange: (mode: WorkspaceMode) => void
  workspaceModeEnabled: boolean
  dashboardPendingCount: number | null
  /** Show the sidebar toggle (hidden in settings, where there is no sidebar). */
  showToggle: boolean
  projectName?: string
  onOpenPalette: () => void
  gitStatus: GitStatus | null
  gitLoading: boolean
  onToggle: () => void
  onInitGit: () => void
  /** Active workspace's effective repo dir, for the branch switcher. */
  gitDir: string | null
  /** True when the current branch may be switched (a repo, not a worktree workspace). */
  branchSwitchable: boolean
  /** Re-read git status right after a successful branch switch. */
  onBranchSwitched: () => void
  /** Open the quick-launch preset picker (also reachable via its shortcut). */
  onOpenLauncher: () => void
  /** False when no workspace is active — launching can't work, so the button
      is disabled with an explanatory tooltip instead of opening a dead picker. */
  launcherEnabled: boolean
  /** Open the saved-prompt picker for the focused terminal. */
  onOpenPromptPicker: () => void
  promptPickerEnabled: boolean
  /** Toggle typing into all terminal cells in the active workspace. */
  onToggleBroadcast: () => void
  broadcastEnabled: boolean
  broadcastActive: boolean
  /** Toggle the right-hand panel. Its button is pinned to the very right edge. */
  onToggleRight: () => void
  /** Current open state of the right panel, for aria-expanded. */
  rightOpen: boolean
  /** Current collapsed state of the left sidebar, for aria-expanded. */
  sidebarCollapsed: boolean
  /** Profiles for the right-hand switcher (each owns its own folders). */
  profiles: Profile[]
  activeProfileId: string | null
  /** Select a profile from the title-bar dropdown. */
  onSelectProfile: (id: string) => void
  /** Open the "Manage profiles" modal. */
  onManageProfiles: () => void
  /** Hex tint of the active profile; tints the strip when set. */
  tintColor?: string | null
}

/**
 * Full-width draggable window strip across the top. The sidebar toggle lives
 * here (next to the native traffic lights on macOS / custom controls elsewhere)
 * so it stays put when the sidebar collapses to a rail. Settings now lives at the
 * bottom of the sidebar; the right edge holds the panel toggles + window controls.
 */
export function TitleBar({
  workspaceMode,
  workspaceModes = WORKSPACE_MODES,
  onWorkspaceModeChange,
  workspaceModeEnabled,
  dashboardPendingCount,
  showToggle,
  projectName,
  onOpenPalette,
  gitStatus,
  gitLoading,
  onToggle,
  onInitGit,
  gitDir,
  branchSwitchable,
  onBranchSwitched,
  onOpenLauncher,
  launcherEnabled,
  onOpenPromptPicker,
  promptPickerEnabled,
  onToggleBroadcast,
  broadcastEnabled,
  broadcastActive,
  onToggleRight,
  rightOpen,
  sidebarCollapsed,
  profiles,
  activeProfileId,
  onSelectProfile,
  onManageProfiles,
  tintColor
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const shortcutTitle = useShortcutTitle()
  const { shortcuts } = useShortcuts()
  const paletteShortcut = formatChord(shortcuts.openPalette)
  const showGit = showToggle && (gitLoading || gitStatus !== null)
  // Tint only on the main view; settings has no active profile chrome.
  const profileTint = showToggle ? barTint(tintColor) : undefined
  // The window chrome already has its own rounded outline. Keep only the
  // profile-colored fill here; barTint's underline is for terminal topbars and
  // looked like a stray rule across the bottom of the titlebar.
  const tint = profileTint ? { backgroundColor: profileTint.backgroundColor } : undefined
  const onMaximize = isMac ? undefined : () => window.api.windowToggleMaximize()
  return (
    <header
      className="superior-titlebar app-drag relative z-40 flex min-h-[59px] shrink-0 items-center bg-panel transition-colors duration-200"
      style={tint}
    >
      {/* LEFT — sidebar toggle + git status. */}
      <div
        className={`superior-titlebar-start flex min-w-0 items-center ${isMac ? 'pl-20' : 'pl-4'}`}
        onDoubleClick={onMaximize}
      >
        {showToggle && (
          <div className="app-no-drag flex min-w-0 items-center gap-3">
            <SidebarToggle onClick={onToggle} expanded={!sidebarCollapsed} />
            {projectName && <span className="superior-project-crumb max-w-28 truncate font-semibold text-fgdim" title={projectName}>{projectName}</span>}
            {showGit && (
              <>
                {projectName && <span className="superior-project-crumb text-fgmuted" aria-hidden>/</span>}
                {gitLoading && !gitStatus ? (
                  <span role="status" className="flex h-full items-center px-1 text-xs text-fgmuted">
                    {t('titlebar.gitLoading')}
                  </span>
                ) : gitStatus?.isRepository ? (
                  <div className="superior-branch-chip flex h-7 min-w-0 max-w-48 items-center gap-1.5 rounded-lg border border-edge bg-bar px-2 font-mono text-xs text-fg">
                    {branchSwitchable && gitDir ? (
                      <BranchSwitcher
                        gitDir={gitDir}
                        currentBranch={gitStatus.branch ?? 'HEAD'}
                        onSwitched={onBranchSwitched}
                      />
                    ) : (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <BranchIcon className="block h-3.5 w-3.5 shrink-0" />
                        <span className="truncate" title={gitStatus.branch ?? 'HEAD'}>
                          {gitStatus.branch ?? 'HEAD'}
                        </span>
                      </span>
                    )}
                    {!!gitStatus.additions && (
                      <span className="shrink-0 text-status">+{gitStatus.additions}</span>
                    )}
                    {!!gitStatus.deletions && (
                      <span className="shrink-0 text-danger">−{gitStatus.deletions}</span>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onInitGit}
                    disabled={gitLoading || !!gitStatus?.error}
                    title={gitStatus?.error ?? t('titlebar.initGitTitle')}
                    className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <BranchIcon className="block h-3.5 w-3.5 shrink-0" />
                    <span>
                      {gitStatus?.error ? t('titlebar.gitUnavailable') : t('titlebar.initGit')}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showToggle && (
        <div className="superior-command-strip app-no-drag flex min-w-0 flex-initial items-center gap-1 rounded-xl border border-edge bg-bar p-[3px]">
          <button
            type="button"
            onClick={onOpenPalette}
            title={shortcutTitle(t('titlebar.search'), 'openPalette')}
            className="superior-command-search flex h-[30px] w-80 min-w-0 items-center gap-2.5 rounded-[9px] bg-panel px-2.5 text-left text-fgdim transition hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
          >
            <SearchIcon size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t('titlebar.search')}</span>
            <kbd className="superior-command-key shrink-0 rounded-md border border-edge px-1.5 py-0.5 font-mono text-[10px] leading-none">{paletteShortcut}</kbd>
          </button>
          {workspaceModes.length > 1 && (
            <>
              <span className="mx-1 h-5 w-px shrink-0 bg-edge" aria-hidden />
              <div role="group" aria-label={t('code.switchMode')} title={shortcutTitle(t('code.switchMode'), 'toggleWorkspaceMode')}
                className="superior-mode-switch flex shrink-0 gap-0.5">
                {workspaceModes.map((mode) => {
                  const Icon = MODE_ICONS[mode]
                  const count = mode === 'dashboard' ? dashboardPendingCount : null
                  const label = count ? `${t(`titlebar.mode.${mode}`)} · ${t('dashboard.pendingCount', { count })}`
                    : t(`titlebar.mode.${mode}`)
                  return (
                    <button key={mode} type="button" aria-label={label} title={label}
                      aria-pressed={workspaceMode === mode} disabled={!workspaceModeEnabled}
                      onClick={() => onWorkspaceModeChange(mode)}
                      className="relative grid h-7 w-9 place-items-center rounded-[7px] text-fgmuted transition hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">
                      <Icon size={16} />
                      {!!count && <span aria-hidden className="absolute -right-0.5 -top-1 grid min-w-4 place-items-center rounded-full border border-panel bg-warnBg px-0.5 text-[10px] font-bold leading-[14px] text-warn">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className={`superior-titlebar-end flex shrink-0 items-center justify-end gap-2 ${showToggle ? '' : 'ml-auto'}`} onDoubleClick={onMaximize}>
        {showToggle && (
          <>
            <button
              type="button"
              onClick={onOpenPromptPicker}
              disabled={!promptPickerEnabled}
              title={t('prompts.insert')}
              aria-label={t('prompts.insert')}
              className={`${TB_BTN} superior-prompt-action text-fgdim`}
            >
              <PromptIcon size={15} />
            </button>
            <button
              type="button"
              onClick={onToggleBroadcast}
              disabled={!broadcastEnabled}
              aria-pressed={broadcastActive}
              title={t('broadcast.toggle')}
              aria-label={t('broadcast.toggle')}
              className={`${TB_BTN} ${
                broadcastActive ? 'bg-warnBg text-warn' : 'text-fgdim'
              }`}
            >
              <BroadcastIcon size={15} />
            </button>
          </>
        )}

        {/* Visible entry point for the quick-launch picker, so the feature is
            discoverable without knowing its shortcut. */}
        {showToggle && (
          <button
            type="button"
            onClick={onOpenLauncher}
            disabled={!launcherEnabled}
            title={
              launcherEnabled
                ? shortcutTitle(t('terminal.addTerminal'), 'openLauncher')
                : t('terminal.noWorkspace')
            }
            aria-label={t('terminal.addTerminal')}
            className={`${TB_BTN} superior-launch-button`}
          >
            <PlusIcon size={16} />
          </button>
        )}

        {showToggle && (
          <div className="app-no-drag min-w-0">
            <ProfileSwitcher
              profiles={profiles}
              activeProfileId={activeProfileId}
              onSelect={onSelectProfile}
              onManage={onManageProfiles}
            />
          </div>
        )}

        {showToggle && (
          <button
            type="button"
            onClick={onToggleRight}
            aria-expanded={rightOpen}
            title={shortcutTitle(t('common.toggleRightSidebar'), 'toggleRightPanel')}
            aria-label={t('common.toggleRightSidebar')}
            className={`group ${TB_BTN} superior-panel-toggle text-fgdim`}
          >
            <svg
              className="block h-[15px] w-[15px] transition-transform duration-150 group-active:scale-90"
              viewBox="0 0 15 15"
              fill="none"
              aria-hidden
            >
              <rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" />
              <line x1="9.5" y1="2.5" x2="9.5" y2="12.5" stroke="currentColor" />
            </svg>
          </button>
        )}

        {!isMac && <WindowControls />}
      </div>
    </header>
  )
}
