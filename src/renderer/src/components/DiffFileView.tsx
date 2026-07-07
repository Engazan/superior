import { useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { GitDiffFile, GitFileStatus } from '../types'

// Short status badge — letter + colour, mirroring common Git UIs.
const STATUS_META: Record<GitFileStatus, { letter: string; className: string }> = {
  added: { letter: 'A', className: 'text-status' },
  modified: { letter: 'M', className: 'text-warn' },
  deleted: { letter: 'D', className: 'text-danger' },
  renamed: { letter: 'R', className: 'text-accent' },
  untracked: { letter: 'U', className: 'text-status' }
}

interface Props {
  file: GitDiffFile
  /** collapsed by default (used by the history view for large commits) */
  defaultOpen?: boolean
  /** controlled expansion — when provided (with onToggleOpen), the parent owns
      the state so it survives the row moving between staged/unstaged lists */
  open?: boolean
  onToggleOpen?: () => void
  /** hover action rendered at the row's right edge (e.g. stage/unstage) */
  action?: ReactNode
}

/**
 * One expandable file with its hunks rendered as a unified diff. Shared by the
 * working-tree Changes view (with stage/unstage actions) and the commit
 * History view (read-only).
 */
export function DiffFileView({
  file,
  defaultOpen = true,
  open: openProp,
  onToggleOpen,
  action
}: Props): JSX.Element {
  const { t } = useI18n()
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const toggle = onToggleOpen ?? ((): void => setOpenState((o) => !o))
  const meta = STATUS_META[file.status]
  const name = file.path.split('/').pop() ?? file.path
  const dir = file.path.slice(0, file.path.length - name.length)

  return (
    <div className="border-b border-edge">
      <div className="group flex w-full items-center">
        <button
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs transition hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
          title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        >
          <span className={`shrink-0 font-mono font-semibold ${meta.className}`}>{meta.letter}</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="text-fg">{name}</span>
            {dir && <span className="text-fgmuted"> {dir.replace(/\/$/, '')}</span>}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums">
            {file.additions > 0 && <span className="text-status">+{file.additions}</span>}
            {file.additions > 0 && file.deletions > 0 && ' '}
            {file.deletions > 0 && <span className="text-danger">−{file.deletions}</span>}
          </span>
        </button>
        {action && <span className="shrink-0 pr-1.5">{action}</span>}
      </div>

      {open &&
        (file.truncated ? (
          <div className="px-2 py-1.5 text-[11px] italic text-fgmuted">
            {file.binary ? t('changes.binary') : t('changes.tooLarge')}
          </div>
        ) : (
          <div className="overflow-x-auto bg-panel font-mono text-[11px] leading-[1.5]">
            {file.hunks.map((hunk, hi) => (
              // content-visibility lets the browser skip layout/paint of
              // off-screen hunks — a cheap stand-in for real virtualization on
              // hundred-file diffs re-rendered by the 3s poll.
              <div key={hi} className="[content-visibility:auto]">
                <div className="whitespace-pre bg-hover px-2 py-0.5 text-fgmuted">
                  {hunk.header}
                </div>
                {hunk.lines.map((line, li) => {
                  const bg =
                    line.type === 'add'
                      ? 'bg-status/10'
                      : line.type === 'del'
                        ? 'bg-danger/10'
                        : ''
                  const marker =
                    line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
                  const markerColor =
                    line.type === 'add'
                      ? 'text-status'
                      : line.type === 'del'
                        ? 'text-danger'
                        : 'text-transparent'
                  return (
                    // Two gutters (old | new) so deleted-line numbers don't
                    // interleave with new-file numbers in a single column.
                    <div key={li} className={`flex ${bg}`}>
                      <span className="w-8 shrink-0 select-none px-1 text-right text-fgmuted tabular-nums">
                        {line.oldLine ?? ''}
                      </span>
                      <span className="w-8 shrink-0 select-none px-1 text-right text-fgmuted tabular-nums">
                        {line.newLine ?? ''}
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
