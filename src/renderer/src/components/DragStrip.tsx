import { WindowControls } from './WindowControls'
import { SidebarToggle } from './SidebarToggle'

const isMac = window.api.platform === 'darwin'

interface Props {
  /** When provided, a sidebar toggle is shown on the left of the strip. */
  onToggleSidebar?: () => void
}

/**
 * The draggable window strip that sits at the top of the sidebar — this is the
 * merged "title bar". On macOS it leaves room for the native traffic lights;
 * on other platforms it carries our custom window controls on the right.
 *
 * The strip is h-9, matching the content top bar, so the sidebar toggle keeps
 * the exact same screen position whether the sidebar is open or collapsed.
 */
export function DragStrip({ onToggleSidebar }: Props): JSX.Element {
  return (
    <div className="app-drag flex h-9 shrink-0 items-center">
      {onToggleSidebar && (
        // On macOS, inset past the native traffic lights so the toggle sits next to them.
        <div className={`flex items-center ${isMac ? 'pl-[68px]' : 'pl-2'}`}>
          <SidebarToggle onClick={onToggleSidebar} />
        </div>
      )}

      <div
        className="h-full flex-1"
        onDoubleClick={isMac ? undefined : () => window.api.windowToggleMaximize()}
      />

      {!isMac && <WindowControls />}
    </div>
  )
}
