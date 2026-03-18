import { WindowControls } from './WindowControls'
import { SidebarToggle } from './SidebarToggle'
import { useI18n } from '../i18n'
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
  onOpenSettings
}: Props): JSX.Element {
  const { t } = useI18n()
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
          title={t('sidebar.settings')}
          aria-label={t('sidebar.settings')}
          className="app-no-drag grid h-full w-10 place-items-center p-0 text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <svg
            className="block h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" />
            <path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58-1.92-3.32-2.39.96a7.54 7.54 0 0 0-1.63-.94L14.87 3h-3.84l-.36 3.18c-.58.24-1.12.55-1.63.94l-2.39-.96-1.92 3.32 2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.39 1.05.7 1.63.94l.36 3.18h3.84l.36-3.18c.58-.24 1.12-.55 1.63-.94l2.39.96 1.92-3.32-2.03-1.58Z" />
          </svg>
        </button>
      )}

      {!isMac && <WindowControls />}
    </header>
  )
}
