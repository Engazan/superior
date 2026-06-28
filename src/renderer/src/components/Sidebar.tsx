import { useEffect, useId, useState, type CSSProperties } from 'react'
import { useI18n, type TFunction } from '../i18n'
import { panelTint } from '../tint'
import type { UpdateController } from '../hooks/useUpdateCheck'
import type { WorkspaceGitStat } from '../hooks/useWorkspaceGitStats'
import type { BranchInfo, Folder, FolderUpdate, Workspace, WorktreeAddArgs } from '../types'

interface Props {
  /** Hex tint of the active profile; washes the whole rail when set. */
  tintColor?: string | null
  folders: Folder[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  /** running-terminal count per workspace id */
  counts: Record<string, number>
  /** git +/- line totals per workspace id, for the diff badge next to each name */
  gitStats: Record<string, WorkspaceGitStat>
  /** workspace ids with a terminal actively producing output */
  busyWorkspaceIds: Set<string>
  /** workspace ids whose terminal finished while unfocused (tab pulses) */
  attentionWorkspaceIds: Set<string>
  /** hex color used for the attention pulse */
  attentionColor: string
  /** update notification + in-app download/install controller */
  update: UpdateController
  collapsed: boolean
  /** True when at least one git-forge integration is configured (enables clone). */
  canClone: boolean
  /** Open the "clone project from an integration" modal. */
  onCloneProject: () => void
  onAddFolder: () => void
  onRemoveFolder: (path: string) => void
  /** Persist a new folder order after a drag-to-reorder in the sidebar. */
  onReorderFolders: (orderedPaths: string[]) => void
  /** Update a folder's display name / custom icon (its path is immutable). */
  onUpdateFolder: (folderPath: string, patch: FolderUpdate) => void
  onAddWorkspace: (folderPath: string, name: string) => Promise<string | null>
  /** Create a worktree-backed workspace; resolves with a localized error or null. */
  onAddWorktreeWorkspace: (args: WorktreeAddArgs) => Promise<string | null>
  onRenameWorkspace: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => void
  onSelectWorkspace: (id: string) => void
}

function initial(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase()
}

/** Tooltip/label for the update button, reflecting the current download phase. */
function updateTitle(update: UpdateController, t: TFunction): string {
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

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function GripIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

function FolderIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

/** A folder's custom icon when set, else the default folder glyph. `size` is px. */
function FolderGlyph({ folder, size = 14 }: { folder: Folder; size?: number }): JSX.Element {
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
  return <FolderIcon />
}

/** Display label for a folder — its user-chosen name, falling back to the basename. */
function folderLabel(folder: Folder): string {
  return folder.displayName?.trim() || folder.name
}

/** Quick-pick background tints for a folder row; users can also choose any custom color. */
const FOLDER_COLOR_SWATCHES = ['#D97757', '#10A37F', '#3B82F6', '#A855F7', '#EAB308', '#EF4444']

/** Subtle row-background tint for a folder's chosen color, or undefined when unset. */
function folderTint(color: string | null | undefined): CSSProperties | undefined {
  return color ? { backgroundColor: `${color}26` } : undefined
}

function PencilGlyph(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-fgmuted"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function RunningBadge({ count, title }: { count: number; title: string }): JSX.Element {
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
function DiffStat({ stat, title }: { stat: WorkspaceGitStat; title: string }): JSX.Element | null {
  if (!stat.isRepository || (stat.additions === 0 && stat.deletions === 0)) return null
  return (
    <span
      title={title}
      className="flex shrink-0 items-center gap-1 font-mono text-[10px] font-semibold leading-none tabular-nums"
    >
      {stat.additions > 0 && <span className="text-emerald-500 dark:text-emerald-400">+{stat.additions}</span>}
      {stat.deletions > 0 && <span className="text-red-500 dark:text-red-400">−{stat.deletions}</span>}
    </span>
  )
}

/** Download-style glyph for the "update available" affordance. */
function UpdateGlyph({ className }: { className?: string }): JSX.Element {
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

/** Git-branch glyph used for the "clone project from an integration" action. */
function CloneGlyph({ className }: { className?: string }): JSX.Element {
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
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <path d="M6 8.5v7" />
      <path d="M18 10.5c0 3-3 3.5-6 3.5" />
    </svg>
  )
}

/** A small spinning ring shown while a workspace's terminals are working. */
function WorkingSpinner({ title, className }: { title?: string; className?: string }): JSX.Element {
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

function BranchGlyph(): JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="4" cy="3.5" r="1.75" />
      <circle cx="4" cy="12.5" r="1.75" />
      <circle cx="12" cy="5.5" r="1.75" />
      <path d="M4 5.25v5.5M10.25 5.5H9A5 5 0 0 0 4 10.5" />
    </svg>
  )
}

function CloseGlyph(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

function WorkspaceGlyph(): JSX.Element {
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

type WorkspaceCreateKind = 'standard' | 'branch'

function WorkspaceTypeSelector({
  value,
  onChange
}: {
  value: WorkspaceCreateKind
  onChange: (value: WorkspaceCreateKind) => void
}): JSX.Element {
  const { t } = useI18n()
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold text-fgdim">
        {t('workspace.type')}
      </legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {(
          [
            ['standard', 'workspace.standardType', 'workspace.standardTypeDescription', <WorkspaceGlyph />],
            ['branch', 'workspace.branchType', 'workspace.branchTypeDescription', <BranchGlyph />]
          ] as const
        ).map(([kind, label, description, icon]) => {
          const selected = value === kind
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(kind)}
              className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                selected
                  ? 'border-accent bg-accentBg/70'
                  : 'border-edge bg-bar hover:border-fgmuted hover:bg-hover'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={selected ? 'text-accent' : 'text-fgmuted'}>{icon}</span>
                <span className="text-sm font-semibold text-fg">{t(label)}</span>
              </span>
              <span className="mt-1.5 block text-[11px] leading-4 text-fgdim">
                {t(description)}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Small branch chip shown under a worktree-backed workspace's name. */
function BranchBadge({ branch, title }: { branch: string; title: string }): JSX.Element {
  return (
    <span
      title={title}
      className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-medium text-fgmuted"
    >
      <BranchGlyph />
      <span className="truncate">{branch}</span>
    </span>
  )
}

/** Dialog to create another terminal/layout context in the same folder. */
function WorkspaceCreateForm({
  folder,
  existingNames,
  onCancel,
  onCreate,
  onSwitchType
}: {
  folder: Folder
  existingNames: string[]
  onCancel: () => void
  onCreate: (folderPath: string, name: string) => Promise<string | null>
  onSwitchType: (value: WorkspaceCreateKind) => void
}): JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const normalizedName = name.trim()
  const duplicate = existingNames.some(
    (existing) => existing.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
  )
  const canSubmit = !!normalizedName && !duplicate && !busy

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onCancel])

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setCreateError(null)
    setBusy(true)
    const error = await onCreate(folder.path, normalizedName)
    setBusy(false)
    if (error) setCreateError(error)
    else onCancel()
  }

  const field =
    'w-full rounded-lg border border-edge bg-bar px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fgmuted focus:border-accent focus:ring-2 focus:ring-accentBorder disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-edge px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accentBg text-accent ring-1 ring-inset ring-accentBorder">
            <WorkspaceGlyph />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {t('workspace.createModalTitle')}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-fgdim">
              {t('workspace.createModalDescription')}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
            aria-label={t('window.close')}
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
          <WorkspaceTypeSelector value="standard" onChange={onSwitchType} />

          <div>
            <label htmlFor="workspace-name" className="mb-1.5 block text-xs font-semibold text-fgdim">
              {t('workspace.name')}
            </label>
            <input
              id="workspace-name"
              autoFocus
              value={name}
              placeholder={t('workspace.namePlaceholder')}
              onChange={(event) => {
                setName(event.target.value)
                setCreateError(null)
              }}
              className={field}
              autoComplete="off"
            />
            <p className={`mt-1.5 text-xs ${duplicate ? 'text-red-600 dark:text-red-300' : 'text-fgmuted'}`}>
              {duplicate ? t('workspace.duplicateName') : t('workspace.nameHint')}
            </p>
          </div>

          <div className="rounded-xl border border-edge bg-bar p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hover text-fgdim">
                <FolderIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{folderLabel(folder)}</p>
                <p className="mt-0.5 truncate text-[11px] text-fgmuted">{folder.path}</p>
              </div>
              <span className="shrink-0 rounded-full bg-accentBg px-2 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-inset ring-accentBorder">
                {t('workspace.sharedFolder')}
              </span>
            </div>
            <p className="mt-3 border-t border-edge pt-3 text-xs leading-5 text-fgdim">
              {t('workspace.sharedFolderDescription')}
            </p>
          </div>

          {normalizedName && !duplicate && (
            <div className="flex items-center gap-3 rounded-lg border border-edge bg-bar px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accentBg text-accent">
                <WorkspaceGlyph />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{normalizedName}</p>
                <p className="mt-0.5 text-[11px] text-fgmuted">{t('workspace.previewDescription')}</p>
              </div>
            </div>
          )}

          {createError && (
            <div
              role="alert"
              className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-xs leading-5 text-red-700 dark:text-red-200"
            >
              {createError}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-edge bg-bar/50 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex min-w-36 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bar transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-40"
          >
            <WorkspaceGlyph />
            {busy ? t('workspace.creating') : t('workspace.createAction')}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Dialog to create a worktree-backed workspace: a new-vs-existing branch
 * choice, the branch itself, and an optional display name.
 */
function WorktreeCreateForm({
  folderPath,
  onCancel,
  onCreate,
  onSwitchType
}: {
  folderPath: string
  onCancel: () => void
  onCreate: (args: WorktreeAddArgs) => Promise<string | null>
  onSwitchType: (value: WorkspaceCreateKind) => void
}): JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [newBranch, setNewBranch] = useState('')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [picked, setPicked] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [branchLoadFailed, setBranchLoadFailed] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    let active = true
    void window.api
      .listBranches(folderPath)
      .then((list) => {
        if (!active) return
        setBranches(list)
        setPicked(list.find((b) => !b.isCheckedOut)?.name ?? '')
      })
      .catch(() => {
        if (active) setBranchLoadFailed(true)
      })
      .finally(() => {
        if (active) setLoadingBranches(false)
      })
    return () => {
      active = false
    }
  }, [folderPath])

  const available = branches.filter((b) => !b.isCheckedOut)
  const branch = mode === 'new' ? newBranch.trim() : picked
  const canSubmit = !!branch && !busy

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onCancel])

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setCreateError(null)
    setBusy(true)
    const error = await onCreate({
      folderPath,
      name: name.trim() || branch,
      branch,
      createBranch: mode === 'new'
    })
    setBusy(false)
    if (error) setCreateError(error)
    else onCancel()
  }

  const field =
    'w-full rounded-lg border border-edge bg-bar px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fgmuted focus:border-accent focus:ring-2 focus:ring-accentBorder disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-edge px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accentBg text-accent ring-1 ring-inset ring-accentBorder">
            <BranchGlyph />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {t('workspace.createModalTitle')}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-fgdim">
              {t('workspace.createModalDescription')}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
            aria-label={t('window.close')}
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
          <WorkspaceTypeSelector value="branch" onChange={onSwitchType} />

          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-fgdim">
              {t('worktree.branchSource')}
            </legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(
                [
                  ['new', 'sidebar.createNewBranch', 'worktree.newBranchDescription'],
                  ['existing', 'sidebar.useExistingBranch', 'worktree.existingBranchDescription']
                ] as const
              ).map(([value, label, description]) => {
                const selected = mode === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMode(value)}
                    className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      selected
                        ? 'border-accent bg-accentBg/70'
                        : 'border-edge bg-bar hover:border-fgmuted hover:bg-hover'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected ? 'border-accent bg-accent' : 'border-fgmuted'
                        }`}
                        aria-hidden
                      >
                        {selected && <span className="h-1.5 w-1.5 rounded-full bg-panel" />}
                      </span>
                      <span className="text-sm font-semibold text-fg">{t(label)}</span>
                    </span>
                    <span className="mt-1.5 block pl-6 text-[11px] leading-4 text-fgdim">
                      {t(description)}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="worktree-branch" className="mb-1.5 block text-xs font-semibold text-fgdim">
              {mode === 'new' ? t('worktree.newBranchName') : t('worktree.existingBranchName')}
            </label>
            {mode === 'new' ? (
              <input
                id="worktree-branch"
                autoFocus
                value={newBranch}
                placeholder={t('sidebar.worktreeBranchPlaceholder')}
                onChange={(event) => setNewBranch(event.target.value)}
                className={`${field} font-mono`}
                autoComplete="off"
                spellCheck={false}
              />
            ) : (
              <>
                <select
                  id="worktree-branch"
                  value={picked}
                  onChange={(event) => setPicked(event.target.value)}
                  disabled={loadingBranches || branchLoadFailed || available.length === 0}
                  className={`${field} font-mono`}
                >
                  {loadingBranches && <option value="">{t('worktree.loadingBranches')}</option>}
                  {!loadingBranches && available.length === 0 && (
                    <option value="">{t('worktree.noBranchesAvailable')}</option>
                  )}
                  {branches.map((item) => (
                    <option key={item.name} value={item.name} disabled={item.isCheckedOut}>
                      {item.name}
                      {item.isCheckedOut ? ` — ${t('worktree.branchInUse')}` : ''}
                    </option>
                  ))}
                </select>
                {branchLoadFailed && (
                  <p className="mt-1.5 text-xs text-red-300">{t('worktree.branchLoadFailed')}</p>
                )}
              </>
            )}
            <p className="mt-1.5 text-xs text-fgmuted">
              {mode === 'new'
                ? t('worktree.newBranchHint')
                : t('worktree.existingBranchHint')}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor="worktree-name" className="text-xs font-semibold text-fgdim">
                {t('worktree.workspaceName')}
              </label>
              <span className="text-[10px] uppercase tracking-wide text-fgmuted">
                {t('worktree.optional')}
              </span>
            </div>
            <input
              id="worktree-name"
              value={name}
              placeholder={branch || t('worktree.workspaceNamePlaceholder')}
              onChange={(event) => setName(event.target.value)}
              className={field}
            />
            <p className="mt-1.5 text-xs text-fgmuted">{t('worktree.workspaceNameHint')}</p>
          </div>

          {branch && (
            <div className="flex items-center gap-3 rounded-lg border border-edge bg-bar px-3 py-2.5">
              <span className="text-accent">
                <BranchGlyph />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-medium text-fg">{branch}</p>
                <p className="mt-0.5 truncate text-[11px] text-fgmuted">{folderPath}</p>
              </div>
              <span className="shrink-0 rounded-full bg-statusBg px-2 py-0.5 text-[10px] font-semibold text-status ring-1 ring-inset ring-statusBorder">
                {t('worktree.isolated')}
              </span>
            </div>
          )}

          {createError && (
            <div
              role="alert"
              className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-xs leading-5 text-red-700 dark:text-red-200"
            >
              {createError}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-edge bg-bar/50 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex min-w-36 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bar transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-40"
        >
          <BranchGlyph />
            {busy ? t('worktree.creating') : t('worktree.createAction')}
        </button>
        </div>
      </form>
      </div>
  )
}

/**
 * Dialog to edit a folder's visuals: a custom display name and an uploaded
 * icon. The folder's path is immutable and shown read-only for reference.
 */
function FolderEditForm({
  folder,
  onCancel,
  onSave
}: {
  folder: Folder
  onCancel: () => void
  onSave: (patch: FolderUpdate) => void
}): JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState(folder.displayName ?? '')
  // undefined = leave icon untouched; string = new icon; null = clear icon.
  const [icon, setIcon] = useState<string | null | undefined>(undefined)
  const [color, setColor] = useState<string | null>(folder.color ?? null)
  const titleId = useId()
  const descriptionId = useId()

  // The icon currently shown in the preview: the pending edit, else the stored one.
  const previewIcon = icon === undefined ? folder.icon : icon

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  const pickIcon = async (): Promise<void> => {
    const picked = await window.api.pickPresetImage()
    if (picked) setIcon(picked.dataUrl)
  }

  const submit = (): void => {
    onSave({
      displayName: name.trim() || null,
      color: color || null,
      ...(icon === undefined ? {} : { icon })
    })
    onCancel()
  }

  const field =
    'w-full rounded-lg border border-edge bg-bar px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fgmuted focus:border-accent focus:ring-2 focus:ring-accentBorder'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-edge px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accentBg text-accent ring-1 ring-inset ring-accentBorder">
            <FolderIcon />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {t('folder.editModalTitle')}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-fgdim">
              {t('folder.editModalDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={t('window.close')}
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-fgdim">
              {t('folder.icon')}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-hover text-fgdim ring-1 ring-inset ring-edge">
                {previewIcon ? (
                  <img src={previewIcon} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FolderIcon />
                )}
              </span>
              <button
                type="button"
                onClick={() => void pickIcon()}
                className="rounded-lg border border-edge bg-bar px-3 py-2 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t('folder.uploadIcon')}
              </button>
              {previewIcon && (
                <button
                  type="button"
                  onClick={() => setIcon(null)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {t('folder.removeIcon')}
                </button>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="folder-name" className="mb-1.5 block text-xs font-semibold text-fgdim">
              {t('folder.displayName')}
            </label>
            <input
              id="folder-name"
              autoFocus
              value={name}
              placeholder={folder.name}
              onChange={(event) => setName(event.target.value)}
              className={field}
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-fgmuted">{t('folder.displayNameHint')}</p>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-fgdim">
              {t('folder.color')}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  color === null
                    ? 'border-accent bg-bar text-fg'
                    : 'border-edge text-fgdim hover:bg-hover'
                }`}
              >
                {t('form.colorNone')}
              </button>
              {FOLDER_COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  className={`h-7 w-7 rounded-md border ${
                    color?.toLowerCase() === c.toLowerCase()
                      ? 'border-accent ring-1 ring-accent'
                      : 'border-edge'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <label
                title={t('form.colorCustom')}
                className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-edge"
                style={{ backgroundColor: color ?? 'transparent' }}
              >
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-fgdim">
                  +
                </span>
                <input
                  type="color"
                  value={color ?? '#888888'}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-edge bg-bar p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hover text-fgdim">
                <FolderIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fgmuted">
                  {t('folder.path')}
                </p>
                <p className="mt-0.5 truncate text-xs text-fg" title={folder.path}>
                  {folder.path}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-edge bg-bar/50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="flex min-w-36 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bar transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            {t('folder.saveAction')}
          </button>
        </div>
      </form>
    </div>
  )
}

export function Sidebar({
  tintColor,
  folders,
  workspaces,
  activeWorkspaceId,
  counts,
  gitStats,
  busyWorkspaceIds,
  attentionWorkspaceIds,
  attentionColor,
  update,
  collapsed,
  canClone,
  onCloneProject,
  onAddFolder,
  onRemoveFolder,
  onReorderFolders,
  onUpdateFolder,
  onAddWorkspace,
  onAddWorktreeWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  onSelectWorkspace
}: Props): JSX.Element {
  const { t } = useI18n()
  // Editors: which workspace is being renamed and which folder is creating a workspace.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [createKind, setCreateKind] = useState<WorkspaceCreateKind>('standard')
  const [draft, setDraft] = useState('')
  // Right-click context menu for a folder, anchored at the cursor.
  const [folderMenu, setFolderMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  // The folder currently open in the edit dialog.
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  // Drag-to-reorder: the folder being dragged and the one currently hovered.
  const [draggingFolder, setDraggingFolder] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  // Move `dragged` to `target`'s slot and persist the resulting folder order.
  const dropFolder = (dragged: string, target: string): void => {
    setDragOverFolder(null)
    setDraggingFolder(null)
    if (dragged === target) return
    const paths = folders.map((f) => f.path)
    const from = paths.indexOf(dragged)
    const to = paths.indexOf(target)
    if (from === -1 || to === -1) return
    paths.splice(from, 1)
    paths.splice(to, 0, dragged)
    onReorderFolders(paths)
  }

  // Persist the expand/collapse state on the folder so it survives a restart.
  const toggleFolder = (folder: Folder): void =>
    onUpdateFolder(folder.path, { collapsed: !folder.collapsed })

  const startRename = (ws: Workspace): void => {
    setAddingFor(null)
    setEditingId(ws.id)
    setDraft(ws.name)
  }
  const commitRename = (): void => {
    if (editingId) onRenameWorkspace(editingId, draft)
    setEditingId(null)
  }
  const startAdd = (folderPath: string): void => {
    setEditingId(null)
    setCreateKind('standard')
    setAddingFor(folderPath)
  }

  // Context menu + edit dialog for folders. Shared between the collapsed rail and
  // the expanded sidebar, both of which render this fragment.
  const menuFolder = folderMenu ? folders.find((f) => f.path === folderMenu.path) ?? null : null
  const folderOverlays = (
    <>
      {folderMenu && menuFolder && (
        <div className="fixed inset-0 z-50" onClick={() => setFolderMenu(null)}>
          <div
            className="absolute min-w-40 overflow-hidden rounded-lg border border-edge bg-panel py-1 shadow-2xl"
            style={{ top: folderMenu.y, left: folderMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setEditingFolder(menuFolder)
                setFolderMenu(null)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-hover"
            >
              <PencilGlyph />
              {t('folder.edit')}
            </button>
            <button
              onClick={() => {
                onRemoveFolder(menuFolder.path)
                setFolderMenu(null)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg transition hover:bg-hover"
            >
              <span className="flex w-3.5 justify-center text-fgmuted">✕</span>
              {t('sidebar.removeFolder')}
            </button>
          </div>
        </div>
      )}
      {editingFolder && (
        <FolderEditForm
          folder={editingFolder}
          onCancel={() => setEditingFolder(null)}
          onSave={(patch) => onUpdateFolder(editingFolder.path, patch)}
        />
      )}
    </>
  )

  // Collapsed: a narrow rail with workspace initials + a running-count dot.
  if (collapsed) {
    return (
      <aside
        style={panelTint(tintColor)}
        className="flex w-14 shrink-0 flex-col items-stretch overflow-hidden border-r border-edge bg-bar transition-[width] duration-200 ease-out"
      >
        {folderOverlays}
        <div className="flex flex-col items-center gap-1 border-b border-edge p-2">
          <button
            onClick={onAddFolder}
            title={t('sidebar.openFolder')}
            aria-label={t('sidebar.openFolder')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            +
          </button>
          {canClone && (
            <button
              onClick={onCloneProject}
              title={t('sidebar.cloneProject')}
              aria-label={t('sidebar.cloneProject')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <CloneGlyph />
            </button>
          )}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          <div className="flex flex-col items-center gap-2">
            {folders.map((folder, i) => {
              const folderWorkspaces = workspaces.filter((w) => w.folderPath === folder.path)
              const folderRunning = folderWorkspaces.reduce((a, w) => a + (counts[w.id] ?? 0), 0)
              const folderBusy = folderWorkspaces.some((w) => busyWorkspaceIds.has(w.id))
              const folderAttn = folderWorkspaces.some((w) => attentionWorkspaceIds.has(w.id))
              return (
                <div key={folder.path} className="flex w-full flex-col items-center gap-1.5">
                  {i > 0 && <div className="my-1 h-px w-6 bg-edge" />}

                  {/* Project marker — folder glyph; jumps to its first workspace */}
                  <button
                    onClick={() => folderWorkspaces[0] && onSelectWorkspace(folderWorkspaces[0].id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setFolderMenu({ path: folder.path, x: e.clientX, y: e.clientY })
                    }}
                    title={folderLabel(folder)}
                    aria-label={folderLabel(folder)}
                    style={folderTint(folder.color)}
                    className="relative flex h-7 w-8 items-center justify-center rounded-md text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <FolderGlyph folder={folder} />
                    {folderBusy ? (
                      <WorkingSpinner className="absolute -right-0.5 -top-0.5 h-3 w-3" />
                    ) : folderAttn ? (
                      <span
                        style={{ '--attn': attentionColor } as CSSProperties}
                        className="attention-pulse-dot absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bar"
                      />
                    ) : (
                      folderRunning > 0 && (
                        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bar bg-status" />
                      )
                    )}
                  </button>

                  {/* Workspaces — square initial badges */}
                  {folderWorkspaces.map((ws) => {
                    const active = ws.id === activeWorkspaceId
                    const n = counts[ws.id] ?? 0
                    const busy = busyWorkspaceIds.has(ws.id)
                    const attn = attentionWorkspaceIds.has(ws.id)
                    return (
                      <button
                        key={ws.id}
                        onClick={() => onSelectWorkspace(ws.id)}
                        title={`${folder.name} / ${ws.name}${ws.branch ? ` · ${ws.branch}` : ''}`}
                        style={attn ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active
                            ? 'bg-accentBg text-accent ring-1 ring-inset ring-accentBorder'
                            : attn
                              ? 'attention-pulse text-fg'
                              : 'text-fgdim hover:bg-hover hover:text-fg'
                        }`}
                      >
                        {initial(ws.name)}
                        {busy ? (
                          <WorkingSpinner className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5" />
                        ) : attn ? (
                          <span
                            style={{ '--attn': attentionColor } as CSSProperties}
                            className="attention-pulse-dot absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-bar"
                          />
                        ) : (
                          n > 0 && (
                            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-bar bg-status" />
                          )
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </nav>
        {update.info?.updateAvailable && (
          <div className="shrink-0 border-t border-edge p-2">
            <button
              onClick={
                update.progress.phase === 'downloaded'
                  ? update.installAndRestart
                  : update.progress.phase === 'error'
                    ? () => window.api.openReleasePage(update.info?.releaseUrl ?? '')
                    : update.progress.phase === 'downloading'
                      ? undefined
                      : update.startDownload
              }
              disabled={update.progress.phase === 'downloading'}
              title={updateTitle(update, t)}
              aria-label={updateTitle(update, t)}
              className="relative mx-auto flex h-8 w-8 items-center justify-center rounded-md text-accent transition hover:bg-hover disabled:cursor-default disabled:opacity-70"
            >
              {update.progress.phase === 'downloading' ? (
                <WorkingSpinner className="h-4 w-4" />
              ) : (
                <UpdateGlyph />
              )}
              <span
                className={`absolute right-0.5 top-0.5 h-2 w-2 rounded-full border-2 border-bar ${
                  update.progress.phase === 'downloaded' ? 'bg-status' : 'bg-accent'
                }`}
              />
            </button>
          </div>
        )}
      </aside>
    )
  }

  return (
    <aside
      style={panelTint(tintColor)}
      className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-edge bg-bar transition-[width] duration-200 ease-out"
    >
      {folderOverlays}
      <div className="border-b border-edge px-2 py-2">
        <button
          onClick={onAddFolder}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="flex h-5 w-5 items-center justify-center text-base leading-none text-accent">
            +
          </span>
          {t('sidebar.openFolder')}
        </button>
        {canClone && (
          <button
            onClick={onCloneProject}
            className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="flex h-5 w-5 items-center justify-center text-accent">
              <CloneGlyph />
            </span>
            {t('sidebar.cloneProject')}
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-2">
        {folders.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs leading-5 text-fgmuted">
            {t('sidebar.noWorkspaces')}
          </p>
        ) : (
          <div className="space-y-3">
            {folders.map((folder) => {
              const folderWorkspaces = workspaces.filter((w) => w.folderPath === folder.path)
              const open = !folder.collapsed
              const folderRunning = folderWorkspaces.reduce((a, w) => a + (counts[w.id] ?? 0), 0)
              return (
                <div
                  key={folder.path}
                  style={folderTint(folder.color)}
                  className={folder.color ? 'rounded-lg p-1' : undefined}
                >
                  {/* Folder header — click to collapse / expand, drag to reorder */}
                  <div
                    draggable
                    onClick={() => toggleFolder(folder)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setFolderMenu({ path: folder.path, x: e.clientX, y: e.clientY })
                    }}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', folder.path)
                      setDraggingFolder(folder.path)
                    }}
                    onDragOver={(e) => {
                      if (!draggingFolder || draggingFolder === folder.path) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (dragOverFolder !== folder.path) setDragOverFolder(folder.path)
                    }}
                    onDragLeave={() => {
                      if (dragOverFolder === folder.path) setDragOverFolder(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const dragged = e.dataTransfer.getData('text/plain') || draggingFolder
                      if (dragged) dropFolder(dragged, folder.path)
                    }}
                    onDragEnd={() => {
                      setDraggingFolder(null)
                      setDragOverFolder(null)
                    }}
                    title={folder.path}
                    className={`group flex cursor-pointer items-center gap-1.5 px-2 py-1 text-fgdim transition hover:bg-hover ${
                      draggingFolder === folder.path ? 'opacity-40' : ''
                    } ${
                      dragOverFolder === folder.path && draggingFolder !== folder.path
                        ? 'ring-1 ring-inset ring-accentBorder'
                        : ''
                    }`}
                  >
                    <span className="flex h-5 w-4 shrink-0 items-center justify-center text-fgmuted">
                      <Chevron open={open} />
                    </span>
                    <span className="text-fgmuted">
                      <FolderGlyph folder={folder} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-fgdim">
                      {folderLabel(folder)}
                    </span>
                    {!open && folderRunning > 0 && (
                      <RunningBadge
                        count={folderRunning}
                        title={t('sidebar.runningTerminals')}
                      />
                    )}
                    <span
                      title={t('sidebar.reorderFolder')}
                      aria-hidden
                      className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-fgmuted opacity-0 transition group-hover:opacity-100"
                    >
                      <GripIcon />
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingFolder(folder)
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg focus:opacity-100 group-hover:opacity-100"
                      aria-label={t('folder.edit')}
                      title={t('folder.edit')}
                    >
                      <PencilGlyph />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveFolder(folder.path)
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg focus:opacity-100 group-hover:opacity-100"
                      aria-label={t('sidebar.removeFolder')}
                      title={t('sidebar.removeFolder')}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Workspaces — indented under a tree guide line */}
                  {open && (
                    <ul className="mt-0.5 space-y-0.5 border-l border-edge">
                      {folderWorkspaces.map((ws) => {
                        const active = ws.id === activeWorkspaceId
                        const attn = attentionWorkspaceIds.has(ws.id)
                        return (
                          <li key={ws.id}>
                            <div
                              onClick={() => onSelectWorkspace(ws.id)}
                              style={attn ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
                              className={`group relative flex min-h-8 cursor-pointer items-center gap-2 py-1 pl-4 pr-2 transition ${
                                active
                                  ? 'bg-accentBg text-fg'
                                  : attn
                                    ? 'attention-pulse text-fg'
                                    : 'text-fg2 hover:bg-hover'
                              }`}
                            >
                              <span
                                style={attn ? { backgroundColor: attentionColor } : undefined}
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  active ? 'bg-accent' : attn ? '' : 'bg-fgmuted'
                                }`}
                              />
                              {active && (
                                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                              )}
                              {editingId === ws.id ? (
                                <input
                                  autoFocus
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onBlur={commitRename}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename()
                                    else if (e.key === 'Escape') setEditingId(null)
                                  }}
                                  className="min-w-0 flex-1 rounded border border-edge bg-panel px-1.5 py-0.5 text-sm text-fg focus:border-accent focus:outline-none"
                                />
                              ) : (
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span
                                    onDoubleClick={(e) => {
                                      e.stopPropagation()
                                      startRename(ws)
                                    }}
                                    className={`truncate text-sm ${
                                      active ? 'font-medium text-fg' : 'text-fg2'
                                    }`}
                                    title={t('sidebar.renameWorkspace')}
                                  >
                                    {ws.name}
                                  </span>
                                  {ws.branch && (
                                    <BranchBadge branch={ws.branch} title={t('sidebar.worktreeBadge')} />
                                  )}
                                </div>
                              )}

                              {editingId !== ws.id && busyWorkspaceIds.has(ws.id) && (
                                <WorkingSpinner title={t('sidebar.workingTerminals')} />
                              )}
                              {editingId !== ws.id && gitStats[ws.id] && (
                                <DiffStat stat={gitStats[ws.id]} title={t('sidebar.diffStat')} />
                              )}

                              {ws.worktreePath && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void window.api.openPath(ws.worktreePath as string)
                                  }}
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg focus:opacity-100 group-hover:opacity-100"
                                  aria-label={t('worktree.revealInFinder')}
                                  title={t('worktree.revealInFinder')}
                                >
                                  <svg
                                    className="h-3.5 w-3.5"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden
                                  >
                                    <path d="M9 2.5h4.5V7" />
                                    <path d="M13.5 2.5 7 9" />
                                    <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
                                  </svg>
                                </button>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onRemoveWorkspace(ws.id)
                                }}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] text-fgmuted opacity-0 transition hover:bg-edge hover:text-fg focus:opacity-100 group-hover:opacity-100"
                                aria-label={t('sidebar.removeWorkspace')}
                                title={t('sidebar.removeWorkspace')}
                              >
                                ✕
                              </button>
                            </div>
                          </li>
                        )
                      })}

                      {/* One entry point for plain and branch-isolated workspaces. */}
                      <li>
                        {addingFor === folder.path ? (
                          createKind === 'standard' ? (
                            <WorkspaceCreateForm
                              folder={folder}
                              existingNames={folderWorkspaces.map((workspace) => workspace.name)}
                              onCancel={() => setAddingFor(null)}
                              onCreate={onAddWorkspace}
                              onSwitchType={setCreateKind}
                            />
                          ) : (
                            <WorktreeCreateForm
                              folderPath={folder.path}
                              onCancel={() => setAddingFor(null)}
                              onCreate={onAddWorktreeWorkspace}
                              onSwitchType={setCreateKind}
                            />
                          )
                        ) : (
                          <button
                            onClick={() => startAdd(folder.path)}
                            className="flex w-full items-center gap-2 py-1.5 pl-4 pr-2 text-xs text-fgmuted transition hover:bg-hover hover:text-fg"
                          >
                            <span className="text-sm leading-none text-accent">+</span>
                            {t('sidebar.addWorkspace')}
                          </button>
                        )}
                      </li>
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </nav>
      {update.info?.updateAvailable && (
        <div className="shrink-0 border-t border-edge p-2">
          <div className="rounded-md bg-accentBg/50 px-2.5 py-2 ring-1 ring-inset ring-accentBorder">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg">
              <UpdateGlyph className="h-3.5 w-3.5 text-accent" />
              <span className="truncate">
                {t('update.available', { version: update.info.latestVersion ?? '' })}
              </span>
            </div>

            {update.progress.phase === 'downloading' ? (
              <>
                <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-edge">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${update.progress.percent ?? 0}%` }}
                  />
                </div>
                <button
                  disabled
                  className="w-full cursor-default rounded-md bg-accent/60 px-2 py-1 text-xs font-semibold text-bar"
                >
                  {t('update.downloading', { percent: String(update.progress.percent ?? 0) })}
                </button>
              </>
            ) : update.progress.phase === 'downloaded' ? (
              <button
                onClick={update.installAndRestart}
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t('update.restart')}
              </button>
            ) : update.progress.phase === 'error' ? (
              <button
                onClick={() => window.api.openReleasePage(update.info?.releaseUrl ?? '')}
                title={t('update.failed')}
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t('update.openPage')}
              </button>
            ) : (
              <button
                onClick={update.startDownload}
                className="w-full rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bar transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t('update.action')}
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
