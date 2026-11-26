import { useI18n } from '../../i18n'
import { GripIcon, KebabIcon, PlusIcon } from '../ui'
import { FolderGlyph, folderLabel, folderTitle, initials } from './parts'
import type { Folder } from '../../types'

type MenuAnchor = HTMLElement | { x: number; y: number }

interface Props {
  folder: Folder
  open: boolean
  expandable: boolean
  /** the active workspace lives in this project */
  active: boolean
  dragging: boolean
  waitingCount: number
  running: boolean
  onActivate: () => void
  onToggle: () => void
  onMenu: (anchor: MenuAnchor) => void
  onAddWorkspace: () => void
  onGripPointerDown: (e: React.PointerEvent<HTMLElement>) => void
}

const HEADER_ACTION =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50'

/**
 * Project header row — opens the project or toggles its children. The grip reorders projects.
 * Its actions (add workspace, the folder menu) show on hover and whenever
 * focus is inside the row, so they're reachable from the keyboard too.
 */
export function FolderHeader({
  folder,
  open,
  expandable,
  active,
  dragging,
  waitingCount,
  running,
  onActivate,
  onToggle,
  onMenu,
  onAddWorkspace,
  onGripPointerDown
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const label = folderLabel(folder)
  const localPath = folder.path.replace(/\\/g, '/').replace(/(.)\/+$/, '$1')
  const lastSlash = localPath.lastIndexOf('/')
  const rootLength = /^[a-z]:\//i.test(localPath) ? 3 : 1
  const parentPath = lastSlash < 0 ? localPath : localPath.slice(0, Math.max(lastSlash, rootLength))
  const subtitle = folder.kind === 'remote' && folder.remote
    ? `ssh · ${folder.remote.host}`
    : parentPath.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~')
  const mark = initials(label)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-description={waitingCount > 0 ? `${t('terminal.activityWaiting')}: ${waitingCount}` : undefined}
      aria-current={active || undefined}
      aria-expanded={expandable ? open : undefined}
      aria-haspopup="menu"
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        } else if (e.key === 'ArrowLeft' && expandable && open) {
          e.preventDefault()
          onToggle()
        } else if (e.key === 'ArrowRight' && expandable && !open) {
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
      data-active={active}
      className="superior-project-row group relative flex h-[46px] cursor-pointer items-center gap-2.5 rounded-[10px] border border-transparent px-2 text-fg transition hover:bg-hover/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
    >
      <span style={folder.color ? { color: folder.color } : undefined}
        className="superior-project-icon grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold" aria-hidden>
        {folder.icon
          ? <FolderGlyph folder={folder} size={18} />
          : mark.toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[13px] leading-4 ${active ? 'font-semibold text-fg' : 'font-medium text-fg2'}`}>
          {label}
        </span>
        <span className="block truncate font-mono text-[11px] leading-[14px] text-fgmuted">
          {subtitle}
        </span>
      </span>
      {waitingCount > 0 ? (
        <span
          title={t('terminal.activityWaiting')}
          className="superior-project-waiting shrink-0 rounded-full bg-warnBg px-[7px] py-0.5 text-[11px] font-semibold leading-[14px] text-warn"
        >
          {waitingCount}
        </span>
      ) : !active && running && (
        <span role="img" aria-label={t('sidebar.runningTerminals')} className="size-2 shrink-0 rounded-full bg-status" />
      )}
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
