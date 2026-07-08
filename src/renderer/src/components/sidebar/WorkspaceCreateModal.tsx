import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { BranchIcon, Button, Input, Modal, Select } from '../ui'
import { FolderGlyph, WorkspaceGlyph, folderLabel } from './parts'
import type { BranchInfo, Folder, WorktreeAddArgs } from '../../types'

export type WorkspaceCreateKind = 'standard' | 'branch'

interface Props {
  folder: Folder
  /** names already used in this folder, for the duplicate check */
  existingNames: string[]
  onCancel: () => void
  onCreateStandard: (folderPath: string, name: string) => Promise<string | null>
  onCreateWorktree: (args: WorktreeAddArgs) => Promise<string | null>
}

/** Radio-card selector for the workspace type, rendered inside the modal. */
function TypeSelector({
  value,
  onChange,
  allowBranch
}: {
  value: WorkspaceCreateKind
  onChange: (value: WorkspaceCreateKind) => void
  allowBranch: boolean
}): JSX.Element {
  const { t } = useI18n()
  const options = (
    [
      ['standard', 'workspace.standardType', 'workspace.standardTypeDescription', <WorkspaceGlyph key="s" />],
      ['branch', 'workspace.branchType', 'workspace.branchTypeDescription', <BranchIcon key="b" size={11} />]
    ] as const
  ).filter(([kind]) => allowBranch || kind !== 'branch')
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold text-fgdim">{t('workspace.type')}</legend>
      <div className={`grid gap-2 ${allowBranch ? 'grid-cols-2' : 'grid-cols-1'}`} role="radiogroup">
        {options.map(([kind, label, description, icon]) => {
          const selected = value === kind
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(kind)}
              className={`rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                selected
                  ? 'border-accent bg-accentBg/70'
                  : 'border-edge bg-bar hover:border-fgmuted hover:bg-hover'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={selected ? 'text-accent' : 'text-fgmuted'}>{icon}</span>
                <span className="text-sm font-semibold text-fg">{t(label)}</span>
              </span>
              <span className="mt-1.5 block text-[11px] leading-4 text-fgdim">{t(description)}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * The one workspace-creation dialog: pick standard vs. branch-isolated INSIDE
 * the modal (the previous design swapped between two separate modals, losing
 * the typed name), fill in the details, create.
 */
export function WorkspaceCreateModal({
  folder,
  existingNames,
  onCancel,
  onCreateStandard,
  onCreateWorktree
}: Props): JSX.Element {
  const { t } = useI18n()
  const [kind, setKind] = useState<WorkspaceCreateKind>('standard')
  const allowBranch = folder.kind !== 'remote'
  // Shared across both kinds so switching type never loses the typed name.
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Branch-isolated state.
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [newBranch, setNewBranch] = useState('')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [picked, setPicked] = useState('')
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [branchLoadFailed, setBranchLoadFailed] = useState(false)

  useEffect(() => {
    if (!allowBranch) {
      setLoadingBranches(false)
      return
    }
    let active = true
    void window.api
      .listBranches(folder.path)
      .then((list) => {
        if (!active) return
        setBranches(list)
        setPicked(list.find((b) => !b.isCheckedOut && !b.isRemote)?.name ?? '')
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
  }, [folder.path, allowBranch])

  const normalizedName = name.trim()
  const duplicate =
    kind === 'standard' &&
    existingNames.some(
      (existing) => existing.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
    )

  // Only local branches can back a worktree; remote-tracking refs are excluded.
  const available = branches.filter((b) => !b.isCheckedOut && !b.isRemote)
  const branch = mode === 'new' ? newBranch.trim() : picked

  const canSubmit =
    !busy && (kind === 'standard' ? !!normalizedName && !duplicate : !!branch)

  const switchKind = (next: WorkspaceCreateKind): void => {
    setKind(next)
    setCreateError(null)
  }

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setCreateError(null)
    setBusy(true)
    const error =
      kind === 'standard'
        ? await onCreateStandard(folder.path, normalizedName)
        : await onCreateWorktree({
            folderPath: folder.path,
            name: normalizedName || branch,
            branch,
            createBranch: mode === 'new'
          })
    setBusy(false)
    if (error) setCreateError(error)
    else onCancel()
  }

  return (
    <Modal
      size="lg"
      title={t('workspace.createModalTitle')}
      description={t('workspace.createModalDescription')}
      onClose={() => !busy && onCancel()}
      closeLabel={t('common.cancel')}
      dismissable={!busy}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
            {busy
              ? kind === 'standard'
                ? t('workspace.creating')
                : t('worktree.creating')
              : kind === 'standard'
                ? t('workspace.createAction')
                : t('worktree.createAction')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <TypeSelector value={kind} onChange={switchKind} allowBranch={allowBranch} />

        {allowBranch && kind === 'branch' && (
          <>
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
                      className={`rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
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
                <Input
                  id="worktree-branch"
                  autoFocus
                  value={newBranch}
                  placeholder={t('sidebar.worktreeBranchPlaceholder')}
                  onChange={(event) => setNewBranch(event.target.value)}
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              ) : (
                <>
                  <Select
                    id="worktree-branch"
                    value={picked}
                    onChange={(event) => setPicked(event.target.value)}
                    disabled={loadingBranches || branchLoadFailed || available.length === 0}
                    className="font-mono"
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
                  </Select>
                  {branchLoadFailed && (
                    <p className="mt-1.5 text-xs text-danger">{t('worktree.branchLoadFailed')}</p>
                  )}
                </>
              )}
              <p className="mt-1.5 text-xs text-fgmuted">
                {mode === 'new' ? t('worktree.newBranchHint') : t('worktree.existingBranchHint')}
              </p>
            </div>
          </>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="workspace-name" className="text-xs font-semibold text-fgdim">
              {kind === 'standard' ? t('workspace.name') : t('worktree.workspaceName')}
            </label>
            {kind === 'branch' && (
              <span className="text-[10px] uppercase tracking-wide text-fgmuted">
                {t('worktree.optional')}
              </span>
            )}
          </div>
          <Input
            id="workspace-name"
            autoFocus={kind === 'standard'}
            value={name}
            placeholder={
              kind === 'standard'
                ? t('workspace.namePlaceholder')
                : branch || t('worktree.workspaceNamePlaceholder')
            }
            onChange={(event) => {
              setName(event.target.value)
              setCreateError(null)
            }}
            invalid={duplicate}
            autoComplete="off"
          />
          <p className={`mt-1.5 text-xs ${duplicate ? 'text-danger' : 'text-fgmuted'}`}>
            {kind === 'standard'
              ? duplicate
                ? t('workspace.duplicateName')
                : t('workspace.nameHint')
              : t('worktree.workspaceNameHint')}
          </p>
        </div>

        {kind === 'standard' && (
          <div className="rounded-lg border border-edge bg-bar p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hover text-fgdim">
                <FolderGlyph folder={folder} />
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
        )}

        {kind === 'branch' && branch && (
          <div className="flex items-center gap-3 rounded-lg border border-edge bg-bar px-3 py-2.5">
            <span className="text-accent">
              <BranchIcon size={11} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs font-medium text-fg">{branch}</p>
              <p className="mt-0.5 truncate text-[11px] text-fgmuted">{folder.path}</p>
            </div>
            <span className="shrink-0 rounded-full bg-statusBg px-2 py-0.5 text-[10px] font-semibold text-status ring-1 ring-inset ring-statusBorder">
              {t('worktree.isolated')}
            </span>
          </div>
        )}

        {createError && (
          <div
            role="alert"
            className="rounded-lg border border-dangerBorder bg-dangerBg px-3 py-2.5 text-xs leading-5 text-danger"
          >
            {createError}
          </div>
        )}

        {/* Hidden submit so Enter in any field submits the form. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
