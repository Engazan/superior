import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { GitDiff, GitDiffFile, GitFileStatus } from '../types'

interface Props {
  /** Folder backing the active workspace, or null when none is selected. */
  folderPath: string | null
}

// Short status badge — letter + colour, mirroring common Git UIs.
const STATUS_META: Record<GitFileStatus, { letter: string; className: string }> = {
  added: { letter: 'A', className: 'text-emerald-500' },
  modified: { letter: 'M', className: 'text-amber-500' },
  deleted: { letter: 'D', className: 'text-rose-500' },
  renamed: { letter: 'R', className: 'text-sky-500' },
  untracked: { letter: 'U', className: 'text-emerald-500' }
}

function BranchIcon(): JSX.Element {
  return (
    <svg
      className="block h-3.5 w-3.5 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="4" cy="3.5" r="1.75" />
      <circle cx="4" cy="12.5" r="1.75" />
      <circle cx="12" cy="5.5" r="1.75" />
      <path d="M4 5.25v5.5M10.25 5.5H9A5 5 0 0 0 4 10.5" />
    </svg>
  )
}

/** One expandable file with its hunks rendered as a unified diff. */
function DiffFile({ file }: { file: GitDiffFile }): JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const meta = STATUS_META[file.status]
  const name = file.path.split('/').pop() ?? file.path
  const dir = file.path.slice(0, file.path.length - name.length)

  return (
    <div className="border-b border-edge">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition hover:bg-hover"
        title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      >
        <span className={`shrink-0 font-mono font-semibold ${meta.className}`}>{meta.letter}</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="text-fg">{name}</span>
          {dir && <span className="text-fgmuted"> {dir.replace(/\/$/, '')}</span>}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums">
          {file.additions > 0 && <span className="text-emerald-500">+{file.additions}</span>}
          {file.additions > 0 && file.deletions > 0 && ' '}
          {file.deletions > 0 && <span className="text-rose-500">−{file.deletions}</span>}
        </span>
      </button>

      {open &&
        (file.truncated ? (
          <div className="px-2 py-1.5 text-[11px] italic text-fgmuted">
            {file.binary ? t('changes.binary') : t('changes.tooLarge')}
          </div>
        ) : (
          <div className="overflow-x-auto bg-panel font-mono text-[11px] leading-[1.5]">
            {file.hunks.map((hunk, hi) => (
              <div key={hi}>
                <div className="whitespace-pre bg-hover px-2 py-0.5 text-fgmuted">
                  {hunk.header}
                </div>
                {hunk.lines.map((line, li) => {
                  const bg =
                    line.type === 'add'
                      ? 'bg-emerald-500/10'
                      : line.type === 'del'
                        ? 'bg-rose-500/10'
                        : ''
                  const marker =
                    line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
                  const markerColor =
                    line.type === 'add'
                      ? 'text-emerald-500'
                      : line.type === 'del'
                        ? 'text-rose-500'
                        : 'text-transparent'
                  return (
                    <div key={li} className={`flex ${bg}`}>
                      <span className="w-9 shrink-0 select-none px-1 text-right text-fgmuted tabular-nums">
                        {line.newLine ?? line.oldLine ?? ''}
                      </span>
                      <span className={`w-3 shrink-0 select-none text-center ${markerColor}`}>
                        {marker}
                      </span>
                      <span className="whitespace-pre pr-2 text-fgdim">{line.content || ' '}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}

export function ChangesView({ folderPath }: Props): JSX.Element {
  const { t } = useI18n()
  const [diff, setDiff] = useState<GitDiff | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(
    async (showLoading: boolean): Promise<void> => {
      if (!folderPath) {
        setDiff(null)
        return
      }
      if (showLoading) setLoading(true)
      const result = await window.api.getGitDiff(folderPath)
      setDiff(result)
      setLoading(false)
    },
    [folderPath]
  )

  // Refetch on folder change and poll so the view tracks working-tree edits.
  useEffect(() => {
    let active = true
    setDiff(null)
    if (!folderPath) return
    const run = async (show: boolean): Promise<void> => {
      if (show) setLoading(true)
      const result = await window.api.getGitDiff(folderPath)
      if (!active) return
      setDiff(result)
      setLoading(false)
    }
    void run(true)
    const id = window.setInterval(() => void run(false), 3000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [folderPath])

  if (!folderPath) {
    return (
      <div className="px-3 py-4 text-xs text-fgmuted">{t('changes.notRepository')}</div>
    )
  }
  if (!diff && loading) {
    return <div className="px-3 py-4 text-xs text-fgmuted">{t('changes.loading')}</div>
  }
  if (diff && (!diff.isRepository || diff.error)) {
    return (
      <div className="px-3 py-4 text-xs text-fgmuted">
        {diff.error ?? t('changes.notRepository')}
      </div>
    )
  }

  const totals = diff?.totals ?? { files: 0, additions: 0, deletions: 0 }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2 text-xs">
        {diff?.branch && (
          <span
            className="flex min-w-0 items-center gap-1.5 font-medium text-fgdim"
            title={diff.branch}
          >
            <BranchIcon />
            <span className="truncate">{diff.branch}</span>
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono tabular-nums text-fgmuted">
          {totals.additions > 0 && <span className="text-emerald-500">+{totals.additions}</span>}
          {totals.additions > 0 && totals.deletions > 0 && ' '}
          {totals.deletions > 0 && <span className="text-rose-500">−{totals.deletions}</span>}
        </span>
        <button
          onClick={() => void refresh(true)}
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

      <div className="px-3 py-1.5 text-[11px] text-fgmuted">
        {totals.files === 0
          ? t('changes.empty')
          : `${totals.files} ${totals.files === 1 ? t('changes.fileChanged') : t('changes.filesChanged')}`}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {diff?.files.map((file) => (
          <DiffFile key={file.oldPath ? `${file.oldPath}>${file.path}` : file.path} file={file} />
        ))}
      </div>
    </div>
  )
}
