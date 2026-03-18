import { WindowControls } from './WindowControls'
import { SidebarToggle } from './SidebarToggle'
import { useI18n } from '../i18n'

const isMac = window.api.platform === 'darwin'

interface Props {
  /** Show the sidebar toggle (hidden in settings, where there is no sidebar). */
  showToggle: boolean
  onToggle: () => void
  /** Open the settings view. The gear sits at the far right of the strip. */
  onOpenSettings: () => void
}

/**
 * Full-width draggable window strip across the top. The sidebar toggle lives
 * here (next to the native traffic lights on macOS / custom controls elsewhere)
 * so it stays put when the sidebar collapses to a rail. The settings gear is
 * pinned to the far right, before the window controls.
 */
export function TitleBar({ showToggle, onToggle, onOpenSettings }: Props): JSX.Element {
  const { t } = useI18n()
  return (
    <header className="app-drag flex h-9 shrink-0 items-center border-b border-edge bg-bar">
      {showToggle && (
        <div className={`app-no-drag flex items-center pr-1 ${isMac ? 'pl-[68px]' : 'pl-2'}`}>
          <SidebarToggle onClick={onToggle} />
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
          className="app-no-drag flex h-full w-11 items-center justify-center text-fgdim transition hover:bg-hover hover:text-fg"
        >
          <span className="text-base leading-none">⚙</span>
        </button>
      )}

      {!isMac && <WindowControls />}
    </header>
  )
}
