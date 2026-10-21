import { useI18n } from '../../i18n'
import { GripIcon, KebabIcon, PlusIcon } from '../ui'
import { FolderGlyph, RunningBadge, folderLabel, folderTitle } from './parts'
import type { Folder } from '../../types'

type MenuAnchor = HTMLElement | { x: number; y: number }

interface Props {
  folder: Folder
  open: boolean
  /** the active workspace lives in this project */
  active: boolean
  dragging: boolean
  /** visible workspaces under this project (after filtering) */
  workspaceCount: number
  runningCount: number
  onToggle: () => void
  onMenu: (anchor: MenuAnchor) => void
  onAddWorkspace: () => void
  onGripPointerDown: (e: React.PointerEvent<HTMLElement>) => void
}

const HEADER_ACTION =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50'

/**
 * Project header row — click to collapse / expand; the grip drags to reorder.
 * Its actions (add workspace, the folder menu) show on hover and whenever
 * focus is inside the row, so they're reachable from the keyboard too.
 */
export function FolderHeader({
  folder,
  open,
  active,
  dragging,
  workspaceCount,
  runningCount,
  onToggle,
  onMenu,
  onAddWorkspace,
  onGripPointerDown
}: Props): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-haspopup="menu"
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        } else if (e.key === 'ArrowLeft' && open) {
          e.preventDefault()
          onToggle()
        } else if (e.key === 'ArrowRight' && !open) {
          e.preventDefault()
          onToggle()
        } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault()
          onMenu(e.currentTarget)
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu({ x: e.clientX, y: e.clientY })
      }}
      title={folderTitle(folder)}
      className="group relative flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-fg transition hover:bg-hover/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
    >
      <span style={folder.color ? { color: folder.color } : undefined} className="flex w-3.5 shrink-0 justify-center text-fgdim">
        <FolderGlyph folder={folder} size={14} />
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] ${active ? 'text-fg' : 'text-fg2'}`}>
        {folderLabel(folder)}
      </span>
      {(!open || workspaceCount > 1) && (
        <span className="mr-1 shrink-0 px-1 text-[11px] font-medium tabular-nums text-fgdim transition group-hover:opacity-0 group-focus-within:opacity-0">
          {workspaceCount}
        </span>
      )}
      {!open && runningCount > 0 && <RunningBadge count={runningCount} title={t('sidebar.runningTerminals')} />}
      {/* Drag handle — the drag itself runs on window listeners
          (see beginFolderDrag), the list live-reorders under the pointer. */}
      <span className="absolute right-1 flex items-center gap-px rounded-full bg-panel opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        <span
          aria-hidden
          title={t('sidebar.reorderFolder')}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={onGripPointerDown}
          className={`flex h-6 w-4 shrink-0 touch-none items-center justify-center text-fgmuted ${
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          <GripIcon size={12} />
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAddWorkspace()
          }}
          className={HEADER_ACTION}
          aria-label={t('sidebar.addWorkspace')}
          title={t('sidebar.addWorkspace')}
        >
          <PlusIcon size={13} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onMenu(e.currentTarget)
          }}
          className={HEADER_ACTION}
          aria-label={t('sidebar.folderActions')}
          title={t('sidebar.folderActions')}
          aria-haspopup="menu"
        >
          <KebabIcon size={14} />
        </button>
      </span>
    </div>
  )
}
