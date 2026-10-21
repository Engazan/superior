import type { CSSProperties } from 'react'
import { useI18n } from '../../i18n'
import { KebabIcon, StarIcon } from '../ui'
import { DiffStat, RemoteBadge, RunningBadge, WorkingSpinner, folderTitle } from './parts'
import type { WorkspaceGitStat } from '../../hooks/useWorkspaceGitStats'
import type { Folder, Workspace } from '../../types'

type MenuAnchor = HTMLElement | { x: number; y: number }

interface Props {
  ws: Workspace
  folder: Folder
  active: boolean
  /** this row is the one being dragged */
  dragging: boolean
  attention: boolean
  busy: boolean
  attentionColor: string
  runningCount: number
  stat: WorkspaceGitStat | undefined
  /** inline rename state; `editing` swaps the name for an input */
  editing: boolean
  draft: string
  onDraftChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  /** favorite state, or null when the workspace tools are hidden */
  favorite: boolean | null
  onToggleFavorite: () => void
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onSelect: () => void
  onStartRename: () => void
  onMenu: (anchor: MenuAnchor) => void
}

/** Trailing icon buttons share one size/shape so hover and focus rings line up. */
const ROW_ACTION =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50'

/**
 * One workspace row under its project. The row itself is the select/drag
 * target; its actions (favorite, the kebab menu) appear on hover AND whenever
 * focus is inside the row, so keyboard users can always reach them.
 */
export function WorkspaceRow({
  ws,
  folder,
  active,
  dragging,
  attention,
  busy,
  attentionColor,
  runningCount,
  stat,
  editing,
  draft,
  onDraftChange,
  onCommitRename,
  onCancelRename,
  favorite,
  onToggleFavorite,
  onPointerDown,
  onSelect,
  onStartRename,
  onMenu
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const hasDiff = !!stat?.isRepository && (stat.additions > 0 || stat.deletions > 0)
  // Two-line rows align the status dot with the name, not the row centre.
  const twoLines = folder.kind === 'remote' || !!ws.branch || hasDiff
  const reveal = 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
  return (
    <li data-workspace-id={ws.id}>
      <div
        role="button"
        tabIndex={0}
        aria-current={active || undefined}
        aria-haspopup="menu"
        onPointerDown={onPointerDown}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (editing || e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          } else if (e.key === 'F2') {
            e.preventDefault()
            onStartRename()
          } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault()
            onMenu(e.currentTarget)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onMenu({ x: e.clientX, y: e.clientY })
        }}
        style={attention ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
        className={`group relative flex min-h-7 cursor-pointer items-center gap-2 rounded-md py-1 pl-4 pr-1 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 ${
          dragging ? 'opacity-60 ring-1 ring-accentBorder ' : ''
        }${active ? 'bg-accentBg text-fg' : 'text-fg2 hover:bg-hover/70'}`}
      >
        <span className={`flex h-4 w-3.5 shrink-0 items-center justify-center ${twoLines ? 'self-start' : ''}`}>
          {attention ? (
            <span
              role="img"
              aria-label={t('terminal.statusFinished')}
              title={t('terminal.statusFinished')}
              style={{ '--attn': attentionColor } as CSSProperties}
              className="attention-pulse-dot h-2 w-2 rounded-full"
            />
          ) : busy ? (
            <span role="img" aria-label={t('sidebar.workingTerminals')} title={t('sidebar.workingTerminals')}>
              <WorkingSpinner className="h-3 w-3" />
            </span>
          ) : (
            <span aria-hidden className={`h-2 w-2 rounded-full ${runningCount > 0 ? 'bg-status' : 'bg-fgmuted/45'}`} />
          )}
        </span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            aria-label={t('sidebar.renameWorkspaceAction')}
            onChange={(e) => onDraftChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename()
              else if (e.key === 'Escape') onCancelRename()
            }}
            className="min-w-0 flex-1 select-text rounded-md border border-edge bg-panel px-1.5 py-0.5 text-[13px] leading-4 text-fg focus:border-accent focus:outline-hidden"
          />
        ) : (
          // Two-line row: name on top; branch + diff stat on a
          // second, smaller line so nothing overlaps at 224px.
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              onDoubleClick={(e) => {
                e.stopPropagation()
                onStartRename()
              }}
              className={`truncate text-[13px] leading-4 ${active ? 'font-semibold text-fg' : 'font-medium text-fg2'}`}
              // The tooltip shows the workspace itself (its branch/
              // path live only on the collapsed rail otherwise);
              // rename stays discoverable via the kebab menu.
              title={ws.branch ? `${ws.name} · ${ws.branch}` : ws.name}
            >
              {ws.name}
            </span>
            {twoLines && (
              <span className="flex min-w-0 items-center gap-2">
                {folder.kind === 'remote' && <RemoteBadge title={folderTitle(folder)} />}
                {ws.branch && (
                  <span title={t('sidebar.worktreeBadge')} className="min-w-0 truncate text-[11px] leading-4 text-fgmuted">
                    {ws.branch}
                  </span>
                )}
                {hasDiff && stat && <DiffStat stat={stat} title={t('sidebar.diffStat')} />}
              </span>
            )}
          </div>
        )}

        {!editing && favorite !== null && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite()
            }}
            className={`${ROW_ACTION} ${favorite ? 'text-accent' : `text-fgmuted ${reveal}`}`}
            aria-label={favorite ? t('sidebar.unfavorite') : t('sidebar.favorite')}
            title={favorite ? t('sidebar.unfavorite') : t('sidebar.favorite')}
            aria-pressed={favorite}
          >
            <StarIcon size={12} className={favorite ? 'fill-current' : ''} />
          </button>
        )}

        {/* The running count and the kebab share one trailing slot: the count
            yields to the kebab on hover/focus so the row never reflows. */}
        {!editing && (
          <span className="ml-auto grid shrink-0 place-items-center">
            {runningCount > 0 && (
              <span className="transition [grid-area:1/1] group-hover:opacity-0 group-focus-within:opacity-0">
                <RunningBadge count={runningCount} title={t('sidebar.runningTerminals')} />
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onMenu(e.currentTarget)
              }}
              aria-label={t('sidebar.workspaceActions')}
              title={t('sidebar.workspaceActions')}
              aria-haspopup="menu"
              className={`${ROW_ACTION} text-fgmuted [grid-area:1/1] ${reveal}`}
            >
              <KebabIcon size={14} />
            </button>
          </span>
        )}
      </div>
    </li>
  )
}
