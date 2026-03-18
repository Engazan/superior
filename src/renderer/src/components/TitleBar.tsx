import { WindowControls } from './WindowControls'
import { SidebarToggle } from './SidebarToggle'

const isMac = window.api.platform === 'darwin'

interface Props {
  /** Show the sidebar toggle (hidden in settings, where there is no sidebar). */
  showToggle: boolean
  onToggle: () => void
}

/**
 * Full-width draggable window strip across the top. The sidebar toggle lives
 * here (next to the native traffic lights on macOS / custom controls elsewhere)
 * so it stays put when the sidebar collapses to a rail.
 */
export function TitleBar({ showToggle, onToggle }: Props): JSX.Element {
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

      {!isMac && <WindowControls />}
    </header>
  )
}
