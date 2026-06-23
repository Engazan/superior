import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import type { BranchInfo } from '../types'

interface Props {
  /** Repo directory whose HEAD we switch (the active workspace's effective dir). */
  gitDir: string
  /** Current branch, shown in the trigger and marked in the list. */
  currentBranch: string
  /** Called after a successful switch so the title bar re-reads git status. */
  onSwitched: () => void
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

function Caret(): JSX.Element {
  return (
    <svg
      className="block h-2.5 w-2.5 shrink-0 text-fgmuted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/**
 * Title-bar branch switcher: click the branch to open a searchable list of local
 * branches and check one out. Uncommitted changes are handled without ever
 * discarding work — see {@link import('../../../main/services/git.service').switchBranch}:
 * a plain checkout carries non-conflicting edits over; a conflict surfaces a
 * "Stash & switch" choice (recoverable via `git stash pop`); branches already
 * checked out in another worktree are listed but disabled.
 */
export function BranchSwitcher({ gitDir, currentBranch, onSwitched }: Props): JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // When a switch is blocked by local changes, hold the target until the user decides.
  const [conflict, setConflict] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // (Re)load the branch list each time the menu opens, resetting transient state.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setError(null)
    setConflict(null)
    setNote(null)
    setBranches(null)
    void window.api.listBranches(gitDir).then(setBranches)
  }, [open, gitDir])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = branches ?? []
    return q ? list.filter((b) => b.name.toLowerCase().includes(q)) : list
  }, [branches, query])

  const doSwitch = async (branch: string, stash: boolean): Promise<void> => {
    setBusy(branch)
    setError(null)
    setNote(null)
    try {
      const res = await window.api.switchBranch(gitDir, branch, stash ? { stash: true } : undefined)
      if (res.error) {
        if (res.dirtyConflict) {
          setConflict(branch) // offer Stash & switch
        } else {
          setError(res.error)
          setConflict(null)
        }
        return
      }
      onSwitched()
      if (res.stashed) {
        // Leave the menu open just long enough to tell the user where their work went.
        setConflict(null)
        setNote(t('branch.stashedNote'))
        void window.api.listBranches(gitDir).then(setBranches)
      } else {
        setOpen(false)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={ref} className="app-no-drag relative flex items-center">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('branch.switch')}
        aria-label={t('branch.switch')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 min-w-0 max-w-64 items-center gap-1.5 rounded px-1.5 text-xs font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <BranchIcon />
        <span className="truncate">{currentBranch}</span>
        <Caret />
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-50 flex max-h-[60vh] w-72 flex-col overflow-hidden rounded-md border border-edge bg-panel shadow-lg">
          <div className="border-b border-edge p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('branch.search')}
              className="w-full rounded border border-edge bg-bar px-2 py-1 text-xs text-fg outline-none placeholder:text-fgmuted focus:border-accent"
              autoComplete="off"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {branches === null ? (
              <div className="px-3 py-2 text-xs text-fgmuted">{t('branch.loading')}</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-fgmuted">{t('branch.none')}</div>
            ) : (
              filtered.map((b) => {
                const blockedElsewhere = b.isCheckedOut && !b.isCurrent
                const disabled = b.isCurrent || blockedElsewhere || busy !== null
                return (
                  <button
                    key={b.name}
                    disabled={disabled}
                    onClick={() => void doSwitch(b.name, false)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                      disabled ? 'cursor-default text-fgmuted' : 'text-fg hover:bg-hover'
                    }`}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-accent">
                      {b.isCurrent ? '✓' : ''}
                    </span>
                    <span className="truncate">{b.name}</span>
                    {b.isCurrent && <span className="ml-auto shrink-0 text-fgmuted">{t('branch.current')}</span>}
                    {blockedElsewhere && (
                      <span className="ml-auto shrink-0 text-amber-400/80">{t('branch.inUse')}</span>
                    )}
                    {busy === b.name && (
                      <span className="ml-auto shrink-0 text-fgmuted">{t('branch.switching')}</span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {conflict && (
            <div className="border-t border-edge bg-amber-500/10 p-2.5 text-xs">
              <p className="mb-2 text-amber-200">{t('branch.dirtyBody', { branch: conflict })}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConflict(null)}
                  className="rounded px-2 py-1 text-fgdim transition hover:bg-hover hover:text-fg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => void doSwitch(conflict, true)}
                  disabled={busy !== null}
                  className="rounded bg-amber-600 px-2 py-1 font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
                >
                  {t('branch.stashAndSwitch')}
                </button>
              </div>
            </div>
          )}

          {note && <div className="border-t border-edge p-2.5 text-xs text-fgdim">{note}</div>}
          {error && (
            <div className="border-t border-edge p-2.5 text-xs text-rose-400">
              {t('branch.switchFailed', { message: error })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
