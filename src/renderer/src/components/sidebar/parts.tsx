import type { CSSProperties } from 'react'
import type { TFunction } from '../../i18n'
import type { UpdateController } from '../../hooks/useUpdateCheck'
import type { WorkspaceGitStat } from '../../hooks/useWorkspaceGitStats'
import { BranchIcon, FolderIcon } from '../ui'
import type { Folder } from '../../types'

export function initial(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase()
}

/** Tooltip/label for the update button, reflecting the current download phase. */
export function updateTitle(update: UpdateController, t: TFunction): string {
  switch (update.progress.phase) {
    case 'downloading':
      return t('update.downloading', { percent: String(update.progress.percent ?? 0) })
    case 'downloaded':
      return t('update.restart')
    case 'error':
      return t('update.failed')
    default:
      return t('update.available', { version: update.info?.latestVersion ?? '' })
  }
}

/** Display label for a folder — its user-chosen name, falling back to the basename. */
export function folderLabel(folder: Folder): string {
  return folder.displayName?.trim() || folder.name
}

/** Subtle row-background tint for a folder's chosen color, or undefined when unset. */
export function folderTint(color: string | null | undefined): CSSProperties | undefined {
  return color ? { backgroundColor: `${color}26` } : undefined
}

/** A folder's custom icon when set, else the default folder glyph. `size` is px. */
export function FolderGlyph({ folder, size = 14 }: { folder: Folder; size?: number }): JSX.Element {
  if (folder.icon) {
    return (
      <img
        src={folder.icon}
        alt=""
        aria-hidden
        className="shrink-0 rounded-sm object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return <FolderIcon className="shrink-0" />
}

export function RunningBadge({ count, title }: { count: number; title: string }): JSX.Element {
  return (
    <span
      title={title}
      className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-statusBg px-1.5 text-[10px] font-bold leading-none text-status ring-1 ring-inset ring-statusBorder"
    >
      {count}
    </span>
  )
}

/**
 * Compact +added / −removed line counts from git, shown beside a workspace
 * name. Renders nothing when the tree is clean so unchanged workspaces stay
 * uncluttered. Only the non-zero side(s) appear.
 */
export function DiffStat({
  stat,
  title
}: {
  stat: WorkspaceGitStat
  title: string
}): JSX.Element | null {
  if (!stat.isRepository || (stat.additions === 0 && stat.deletions === 0)) return null
  return (
    <span
      title={title}
      className="flex shrink-0 items-center gap-1 font-mono text-[10px] font-semibold leading-none tabular-nums"
    >
      {stat.additions > 0 && <span className="text-status">+{stat.additions}</span>}
      {stat.deletions > 0 && <span className="text-danger">−{stat.deletions}</span>}
    </span>
  )
}

/** Download-style glyph for the "update available" affordance. */
export function UpdateGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className ?? 'h-4 w-4'}`}
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  )
}

/** A small spinning ring shown while a workspace's terminals are working. */
export function WorkingSpinner({
  title,
  className
}: {
  title?: string
  className?: string
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 animate-spin text-status ${className ?? 'h-3.5 w-3.5'}`}
      aria-hidden
    >
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Small branch chip shown under a worktree-backed workspace's name. */
export function BranchBadge({ branch, title }: { branch: string; title: string }): JSX.Element {
  return (
    <span
      title={title}
      className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-medium text-fgmuted"
    >
      <BranchIcon size={11} className="shrink-0" />
      <span className="truncate">{branch}</span>
    </span>
  )
}

export function WorkspaceGlyph(): JSX.Element {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18M9 9v12" />
    </svg>
  )
}
