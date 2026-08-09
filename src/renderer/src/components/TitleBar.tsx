import { WindowControls } from './WindowControls'
import { SidebarToggle } from './SidebarToggle'
import { ProfileSwitcher } from './ProfileSwitcher'
import { BranchSwitcher } from './BranchSwitcher'
import { BranchIcon } from './ui'
import { useI18n } from '../i18n'
import { useShortcutTitle } from '../shortcuts'
import { barTint } from '../tint'
import type { GitStatus, Profile } from '../types'

const isMac = window.api.platform === 'darwin'

interface Props {
  /** Show the sidebar toggle (hidden in settings, where there is no sidebar). */
  showToggle: boolean
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
  /** Toggle the right-hand panel. Its button is pinned to the very right edge. */
  onToggleRight: () => void
  /** Current open state of the right panel, for aria-expanded. */
  rightOpen: boolean
  /** Current collapsed state of the left sidebar, for aria-expanded. */
  sidebarCollapsed: boolean
  /** Profiles for the center switcher (each owns its own folders). */
  profiles: Profile[]
  activeProfileId: string | null
  /** Select a profile from the center dropdown. */
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
  showToggle,
  gitStatus,
  gitLoading,
  onToggle,
  onInitGit,
  gitDir,
  branchSwitchable,
  onBranchSwitched,
  onOpenLauncher,
  launcherEnabled,
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
      className="superior-titlebar app-drag relative z-40 flex h-11 shrink-0 items-center bg-panel/80 transition-colors duration-200"
      style={tint}
    >
      {/* LEFT — sidebar toggle + git status. */}
      <div
        className={`flex h-full min-w-0 flex-1 items-center ${isMac ? 'pl-[84px]' : 'pl-1'}`}
        onDoubleClick={onMaximize}
      >
        {showToggle && (
          <div className="app-no-drag flex h-full min-w-0 items-center pr-1">
            <SidebarToggle onClick={onToggle} expanded={!sidebarCollapsed} />
            {showGit && (
              <>
                <span className="mx-2 h-4 w-px shrink-0 bg-edge" aria-hidden />
                {gitLoading && !gitStatus ? (
                  <span className="flex h-full items-center px-1 text-xs text-fgmuted">
                    {t('titlebar.gitLoading')}
                  </span>
                ) : gitStatus?.isRepository ? (
                  <div className="flex h-full min-w-0 max-w-72 items-center gap-1.5 px-1 text-xs font-medium text-fgdim">
                    {branchSwitchable && gitDir ? (
                      <BranchSwitcher
                        gitDir={gitDir}
                        currentBranch={gitStatus.branch ?? 'HEAD'}
                        onSwitched={onBranchSwitched}
                      />
                    ) : (
                      <>
                        <BranchIcon className="block h-3.5 w-3.5 shrink-0" />
                        <span className="truncate" title={gitStatus.branch ?? 'HEAD'}>
                          {gitStatus.branch ?? 'HEAD'}
                        </span>
                      </>
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
                    onClick={onInitGit}
                    disabled={gitLoading || !!gitStatus?.error}
                    title={gitStatus?.error ?? t('titlebar.initGitTitle')}
                    className="flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-fgdim transition hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-50"
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

      {/* CENTER — pin the profile switcher to the title bar's actual midpoint,
          independently of the widths of the controls on either side. */}
      <div
        className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 items-center justify-center"
        onDoubleClick={onMaximize}
      >
        {showToggle && (
          <ProfileSwitcher
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSelect={onSelectProfile}
            onManage={onManageProfiles}
          />
        )}
      </div>

      {/* RIGHT — quick-launch + right-panel toggles + window controls. */}
      <div className="flex h-full min-w-0 flex-1 items-center justify-end" onDoubleClick={onMaximize}>
        {/* Visible entry point for the quick-launch picker, so the feature is
            discoverable without knowing its shortcut. */}
        {showToggle && (
          <button
            onClick={onOpenLauncher}
            disabled={!launcherEnabled}
            title={
              launcherEnabled
                ? shortcutTitle(t('terminal.addTerminal'), 'openLauncher')
                : t('terminal.noWorkspace')
            }
            aria-label={t('terminal.addTerminal')}
            className="app-no-drag my-1.5 grid h-8 w-9 place-items-center rounded-full p-0 text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <svg
              className="block h-[16px] w-[16px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m7 9 3 3-3 3M12 15h5" />
            </svg>
          </button>
        )}

        {showToggle && (
          <button
            onClick={onToggleRight}
            aria-expanded={rightOpen}
            title={shortcutTitle(t('common.toggleRightSidebar'), 'toggleRightPanel')}
            aria-label={t('common.toggleRightSidebar')}
            className="group app-no-drag my-1.5 grid h-8 w-9 place-items-center rounded-full p-0 text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
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
