import { useEffect, useId, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import type { BranchInfo, Folder, Workspace, WorktreeAddArgs } from '../types'

interface Props {
  folders: Folder[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  /** running-terminal count per workspace id */
  counts: Record<string, number>
  /** workspace ids with a terminal actively producing output */
  busyWorkspaceIds: Set<string>
  /** workspace ids whose terminal finished while unfocused (tab pulses) */
  attentionWorkspaceIds: Set<string>
  /** hex color used for the attention pulse */
  attentionColor: string
  collapsed: boolean
  onAddFolder: () => void
  onRemoveFolder: (path: string) => void
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
                <p className="truncate text-sm font-semibold text-fg">{folder.name}</p>
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

export function Sidebar({
  folders,
  workspaces,
  activeWorkspaceId,
  counts,
  busyWorkspaceIds,
  attentionWorkspaceIds,
  attentionColor,
  collapsed,
  onAddFolder,
  onRemoveFolder,
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
  // Folders the user has collapsed (rolled up) in the sidebar.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  const toggleFolder = (path: string): void =>
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

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

  // Collapsed: a narrow rail with workspace initials + a running-count dot.
  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-stretch overflow-hidden border-r border-edge bg-bar transition-[width] duration-200 ease-out">
        <div className="flex flex-col items-center border-b border-edge p-2">
          <button
            onClick={onAddFolder}
            title={t('sidebar.openFolder')}
            aria-label={t('sidebar.openFolder')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            +
          </button>
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
                    title={folder.name}
                    aria-label={folder.name}
                    className="relative flex h-7 w-8 items-center justify-center rounded-md text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <FolderIcon />
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
      </aside>
    )
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-edge bg-bar transition-[width] duration-200 ease-out">
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
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {folders.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs leading-5 text-fgmuted">
            {t('sidebar.noWorkspaces')}
          </p>
        ) : (
          <div className="space-y-3">
            {folders.map((folder) => {
              const folderWorkspaces = workspaces.filter((w) => w.folderPath === folder.path)
              const open = !collapsedFolders.has(folder.path)
              const folderRunning = folderWorkspaces.reduce((a, w) => a + (counts[w.id] ?? 0), 0)
              return (
                <div key={folder.path}>
                  {/* Folder header — click to collapse / expand */}
                  <div
                    onClick={() => toggleFolder(folder.path)}
                    title={folder.path}
                    className="group flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-fgdim transition hover:bg-hover"
                  >
                    <span className="flex h-5 w-4 shrink-0 items-center justify-center text-fgmuted">
                      <Chevron open={open} />
                    </span>
                    <span className="text-fgmuted">
                      <FolderIcon />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-fgdim">
                      {folder.name}
                    </span>
                    {!open && folderRunning > 0 && (
                      <RunningBadge
                        count={folderRunning}
                        title={t('sidebar.runningTerminals')}
                      />
                    )}
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
                    <ul className="ml-[13px] mt-0.5 space-y-0.5 border-l border-edge pl-2">
                      {folderWorkspaces.map((ws) => {
                        const active = ws.id === activeWorkspaceId
                        const n = counts[ws.id] ?? 0
                        const attn = attentionWorkspaceIds.has(ws.id)
                        return (
                          <li key={ws.id}>
                            <div
                              onClick={() => onSelectWorkspace(ws.id)}
                              style={attn ? ({ '--attn': attentionColor } as CSSProperties) : undefined}
                              className={`group relative flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition ${
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
                                <span className="absolute -left-[9px] top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
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
                              {n > 0 && editingId !== ws.id && (
                                <RunningBadge count={n} title={t('sidebar.runningTerminals')} />
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
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-fgmuted transition hover:bg-hover hover:text-fg"
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
    </aside>
  )
}
