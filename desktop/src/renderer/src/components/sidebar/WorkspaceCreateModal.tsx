import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import {
  BranchIcon,
  Button,
  ChoiceCards,
  Combobox,
  Field,
  FieldTag,
  Input,
  Modal,
  SegmentedControl
} from '../ui'
import { WorkspaceGlyph, folderLabel } from './parts'
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
}: Props): React.JSX.Element {
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

  const branchField =
    mode === 'new' ? (
      <Input
        id="worktree-branch"
        autoFocus
        value={newBranch}
        placeholder={t('sidebar.worktreeBranchPlaceholder')}
        onChange={(event) => {
          setNewBranch(event.target.value)
          setCreateError(null)
        }}
        className="font-mono"
        autoComplete="off"
        spellCheck={false}
      />
    ) : (
      <Combobox
        id="worktree-branch"
        autoFocus
        value={picked}
        onChange={(value) => {
          setPicked(value)
          setCreateError(null)
        }}
        options={branches.map((item) => ({
          value: item.name,
          hint: item.isCheckedOut ? t('worktree.branchInUse') : undefined,
          disabled: item.isCheckedOut
        }))}
        placeholder={
          loadingBranches
            ? t('worktree.loadingBranches')
            : available.length === 0
              ? t('worktree.noBranchesAvailable')
              : t('branch.search')
        }
        emptyText={t('branch.none')}
        disabled={loadingBranches || branchLoadFailed || available.length === 0}
        className="font-mono"
      />
    )

  return (
    <Modal
      size="lg"
      title={t('workspace.createModalTitle')}
      description={
        <span title={folder.path}>{t('workspace.createIn', { folder: folderLabel(folder) })}</span>
      }
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
        {allowBranch && (
          <ChoiceCards
            aria-label={t('workspace.type')}
            value={kind}
            onChange={switchKind}
            options={[
              {
                value: 'standard',
                label: t('workspace.standardType'),
                description: t('workspace.standardTypeDescription'),
                icon: <WorkspaceGlyph />
              },
              {
                value: 'branch',
                label: t('workspace.branchType'),
                description: t('workspace.branchTypeDescription'),
                icon: <BranchIcon size={12} />
              }
            ]}
          />
        )}

        {allowBranch && kind === 'branch' && (
          <Field
            label={t('worktree.branch')}
            htmlFor="worktree-branch"
            aside={
              <SegmentedControl
                size="sm"
                aria-label={t('worktree.branch')}
                value={mode}
                onChange={(value) => {
                  setMode(value)
                  setCreateError(null)
                }}
                options={[
                  { value: 'new', label: t('sidebar.createNewBranch') },
                  { value: 'existing', label: t('sidebar.useExistingBranch') }
                ]}
              />
            }
            error={mode === 'existing' && branchLoadFailed ? t('worktree.branchLoadFailed') : undefined}
            hint={mode === 'new' ? t('worktree.newBranchHint') : t('worktree.existingBranchHint')}
          >
            {branchField}
          </Field>
        )}

        <Field
          label={t('workspace.name')}
          htmlFor="workspace-name"
          aside={kind === 'branch' ? <FieldTag>{t('worktree.optional')}</FieldTag> : undefined}
          error={duplicate ? t('workspace.duplicateName') : undefined}
        >
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
        </Field>

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
