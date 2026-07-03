import { useState } from 'react'
import { useI18n } from '../i18n'
import { DiffFileView } from './DiffFileView'
import { BranchIcon, Button, IconButton, useToast } from './ui'
import type { GitDiff, GitDiffFile } from '../types'

interface Props {
  /** Repo dir the diff belongs to (for stage/commit/push actions). */
  folderPath: string | null
  /** Latest working-tree diff, or null before the first load / no folder. */
  diff: GitDiff | null
  /** True while the first diff for the current folder is loading. */
  loading: boolean
  /** Trigger an immediate refetch. */
  onRefresh: () => void
}

function PlusMark(): JSX.Element {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function MinusMark(): JSX.Element {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  )
}

/** Section header row: label + count + a bulk stage/unstage-all action. */
function SectionHead({
  label,
  count,
  actionLabel,
  onAction
}: {
  label: string
  count: number
  actionLabel: string
  onAction: () => void
}): JSX.Element {
  return (
    <div className="flex items-center justify-between bg-bar px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-fgmuted">
      <span>
        {label} ({count})
      </span>
      {count > 0 && (
        <button
          onClick={onAction}
          className="rounded px-1.5 py-0.5 normal-case tracking-normal text-fgdim transition hover:bg-hover hover:text-fg"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export function ChangesView({ folderPath, diff, loading, onRefresh }: Props): JSX.Element {
  const { t } = useI18n()
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null)

  if (!diff && loading) {
    return <div className="px-3 py-4 text-xs text-fgmuted">{t('changes.loading')}</div>
  }
  if (!diff) {
    return <div className="px-3 py-4 text-xs text-fgmuted">{t('changes.notRepository')}</div>
  }
  if (diff && (!diff.isRepository || diff.error)) {
    return (
      <div className="px-3 py-4 text-xs text-fgmuted">
        {diff.error ?? t('changes.notRepository')}
      </div>
    )
  }

  const totals = diff?.totals ?? { files: 0, additions: 0, deletions: 0 }
  const staged = diff?.staged ?? []
  const unstaged = diff?.files ?? []

  const run = async (fn: () => Promise<{ error?: string }>): Promise<void> => {
    if (!folderPath) return
    const res = await fn()
    if (res.error) toast.error(res.error)
    onRefresh()
  }

  const doCommit = async (): Promise<void> => {
    if (!folderPath || !message.trim() || staged.length === 0) return
    setCommitting(true)
    const res = await window.api.gitCommit(folderPath, message)
    setCommitting(false)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success(t('changes.committed'))
      setMessage('')
    }
    onRefresh()
  }

  const doSync = async (kind: 'push' | 'pull'): Promise<void> => {
    if (!folderPath || syncing) return
    setSyncing(kind)
    const res =
      kind === 'push'
        ? await window.api.gitPush(folderPath)
        : await window.api.gitPull(folderPath)
    setSyncing(null)
    if (res.error) toast.error(res.error)
    else toast.success(kind === 'push' ? t('changes.pushed') : t('changes.pulled'))
    onRefresh()
  }

  const stageAction = (file: GitDiffFile): JSX.Element => (
    <IconButton
      size="sm"
      label={t('changes.stage')}
      onClick={() => void run(() => window.api.gitStage(folderPath ?? '', file.path))}
    >
      <PlusMark />
    </IconButton>
  )
  const unstageAction = (file: GitDiffFile): JSX.Element => (
    <IconButton
      size="sm"
      label={t('changes.unstage')}
      onClick={() => void run(() => window.api.gitUnstage(folderPath ?? '', file.path))}
    >
      <MinusMark />
    </IconButton>
  )

  // Publish (no upstream yet) vs push (ahead of upstream).
  const canPush = diff.upstream ? (diff.ahead ?? 0) > 0 : true
  const canPull = !!diff.upstream && (diff.behind ?? 0) > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2 text-xs">
        {diff?.branch && (
          <span
            className="flex min-w-0 items-center gap-1.5 font-medium text-fgdim"
            title={diff.upstream ? `${diff.branch} → ${diff.upstream}` : diff.branch}
          >
            <BranchIcon size={14} className="shrink-0" />
            <span className="truncate">{diff.branch}</span>
          </span>
        )}

        {/* Pull / push with ahead-behind counts; publish when there's no upstream. */}
        {canPull && (
          <Button
            variant="secondary"
            size="sm"
            className="!h-6 shrink-0 !px-1.5 !text-[11px]"
            loading={syncing === 'pull'}
            disabled={syncing !== null}
            onClick={() => void doSync('pull')}
            title={t('changes.pull')}
          >
            ↓{diff.behind}
          </Button>
        )}
        {canPush && (
          <Button
            variant="secondary"
            size="sm"
            className="!h-6 shrink-0 !px-1.5 !text-[11px]"
            loading={syncing === 'push'}
            disabled={syncing !== null}
            onClick={() => void doSync('push')}
            title={diff.upstream ? t('changes.push') : t('changes.publish')}
          >
            {diff.upstream ? `↑${diff.ahead}` : t('changes.publish')}
          </Button>
        )}

        <span className="ml-auto shrink-0 font-mono tabular-nums text-fgmuted">
          {totals.additions > 0 && <span className="text-status">+{totals.additions}</span>}
          {totals.additions > 0 && totals.deletions > 0 && ' '}
          {totals.deletions > 0 && <span className="text-danger">−{totals.deletions}</span>}
        </span>
        <button
          onClick={onRefresh}
          title={t('changes.refresh')}
          aria-label={t('changes.refresh')}
          className="shrink-0 rounded p-0.5 text-fgmuted transition hover:bg-hover hover:text-fg"
        >
          <svg
            className="block h-3.5 w-3.5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
            <path d="M13.5 2v3.5H10" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {totals.files === 0 ? (
          <div className="px-3 py-4 text-[11px] text-fgmuted">{t('changes.empty')}</div>
        ) : (
          <>
            <SectionHead
              label={t('changes.staged')}
              count={staged.length}
              actionLabel={t('changes.unstageAll')}
              onAction={() => void run(() => window.api.gitUnstageAll(folderPath ?? ''))}
            />
            {staged.map((file) => (
              <DiffFileView
                key={`s:${file.oldPath ? `${file.oldPath}>${file.path}` : file.path}`}
                file={file}
                action={unstageAction(file)}
              />
            ))}

            <SectionHead
              label={t('changes.unstaged')}
              count={unstaged.length}
              actionLabel={t('changes.stageAll')}
              onAction={() => void run(() => window.api.gitStageAll(folderPath ?? ''))}
            />
            {unstaged.map((file) => (
              <DiffFileView
                key={`u:${file.oldPath ? `${file.oldPath}>${file.path}` : file.path}`}
                file={file}
                action={stageAction(file)}
              />
            ))}
          </>
        )}
      </div>

      {/* Commit box — enabled once something is staged and a message is typed. */}
      <div className="shrink-0 space-y-1.5 border-t border-edge p-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void doCommit()
          }}
          rows={2}
          placeholder={t('changes.commitPlaceholder')}
          className="w-full resize-none rounded-md border border-edge bg-bar px-2 py-1.5 text-xs text-fg placeholder:text-fgmuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
        <Button
          size="sm"
          className="w-full"
          disabled={staged.length === 0 || !message.trim()}
          loading={committing}
          onClick={() => void doCommit()}
        >
          {t('changes.commit')}
        </Button>
      </div>
    </div>
  )
}
