import { WindowControls } from './WindowControls'
import { SidebarToggle } from './SidebarToggle'
import { useI18n } from '../i18n'
import { useShortcutTitle } from '../shortcuts'
import type { GitStatus } from '../types'

const isMac = window.api.platform === 'darwin'

interface Props {
  /** Show the sidebar toggle (hidden in settings, where there is no sidebar). */
  showToggle: boolean
  gitStatus: GitStatus | null
  gitLoading: boolean
  onToggle: () => void
  onInitGit: () => void
  /** Open the settings view. The gear sits at the far right of the strip. */
  onOpenSettings: () => void
  /** Toggle the right-hand panel. Its button is pinned to the very right edge. */
  onToggleRight: () => void
}

function BranchIcon(): JSX.Element {
  return (
    <svg
      className="block h-3.5 w-3.5 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="4" cy="3.5" r="1.75" />
      <circle cx="4" cy="12.5" r="1.75" />
      <circle cx="12" cy="5.5" r="1.75" />
      <path d="M4 5.25v5.5M10.25 5.5H9A5 5 0 0 0 4 10.5" />
    </svg>
  )
}

/**
 * Full-width draggable window strip across the top. The sidebar toggle lives
 * here (next to the native traffic lights on macOS / custom controls elsewhere)
 * so it stays put when the sidebar collapses to a rail. The settings gear is
 * pinned to the far right, before the window controls.
 */
export function TitleBar({
  showToggle,
  gitStatus,
  gitLoading,
  onToggle,
  onInitGit,
  onOpenSettings,
  onToggleRight
}: Props): JSX.Element {
  const { t } = useI18n()
  const shortcutTitle = useShortcutTitle()
  const showGit = showToggle && (gitLoading || gitStatus !== null)
  return (
    <header className="app-drag flex h-9 shrink-0 items-center border-b border-edge bg-bar">
      {showToggle && (
        <div
          className={`app-no-drag flex h-full items-center pr-1 ${isMac ? 'pl-[68px]' : 'pl-1'}`}
        >
          <SidebarToggle onClick={onToggle} />
          {showGit && (
            <>
              <span className="mx-2 h-4 w-px shrink-0 bg-edge" aria-hidden />
              {gitLoading && !gitStatus ? (
                <span className="flex h-full items-center px-1 text-xs text-fgmuted">
                  Git…
                </span>
              ) : gitStatus?.isRepository ? (
                <div
                  className="flex h-full min-w-0 max-w-48 items-center gap-1.5 px-1 text-xs font-medium text-fgdim"
                  title={gitStatus.branch ?? 'HEAD'}
                >
                  <BranchIcon />
                  <span className="truncate">{gitStatus.branch ?? 'HEAD'}</span>
                </div>
              ) : (
                <button
                  onClick={onInitGit}
                  disabled={gitLoading || !!gitStatus?.error}
                  title={gitStatus?.error ?? 'Initialize a Git repository in this folder'}
                  className="flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-fgdim transition hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-50"
                >
                  <BranchIcon />
                  <span>{gitStatus?.error ? 'Git unavailable' : 'Init git'}</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div
        className="h-full flex-1"
        onDoubleClick={isMac ? undefined : () => window.api.windowToggleMaximize()}
      />

      {showToggle && (
        <button
          onClick={onOpenSettings}
          title={shortcutTitle(t('sidebar.settings'), 'openSettings')}
          aria-label={t('sidebar.settings')}
          className="app-no-drag grid h-full w-10 place-items-center p-0 text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <svg
            className="block h-[17px] w-[17px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      )}

      {showToggle && (
        <button
          onClick={onToggleRight}
          title={shortcutTitle(t('common.toggleRightSidebar'), 'toggleRightPanel')}
          aria-label={t('common.toggleRightSidebar')}
          className="app-no-drag grid h-full w-10 place-items-center p-0 text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <svg className="block h-[15px] w-[15px]" viewBox="0 0 15 15" fill="none" aria-hidden>
            <rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" />
            <line x1="9.5" y1="2.5" x2="9.5" y2="12.5" stroke="currentColor" />
          </svg>
        </button>
      )}

      {!isMac && <WindowControls />}
    </header>
  )
}
