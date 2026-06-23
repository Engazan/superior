import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n'
import type { Profile } from '../types'

interface Props {
  profiles: Profile[]
  activeProfileId: string | null
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}

function ProfileGlyph(): JSX.Element {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function CloseGlyph(): JSX.Element {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function TrashGlyph(): JSX.Element {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  )
}

/**
 * The "Manage profiles" modal: add, rename, and delete profiles. Renaming
 * commits on blur or Enter; deleting a profile removes all of its folders, so it
 * confirms first and is blocked for the last remaining profile.
 */
export function ProfileManager({
  profiles,
  activeProfileId,
  onAdd,
  onRename,
  onRemove,
  onClose
}: Props): JSX.Element {
  const { t } = useI18n()
  const [newName, setNewName] = useState('')
  // Local draft of each profile's name, keyed by id, so typing stays responsive.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const draftFor = (p: Profile): string => drafts[p.id] ?? p.name

  const commit = (p: Profile): void => {
    const next = (drafts[p.id] ?? p.name).trim()
    if (next && next !== p.name) onRename(p.id, next)
    // Drop the draft so the row reflects the authoritative name again.
    setDrafts((prev) => {
      const { [p.id]: _omit, ...rest } = prev
      return rest
    })
  }

  const submitNew = (): void => {
    const name = newName.trim()
    if (!name) return
    onAdd(name)
    setNewName('')
  }

  const remove = (p: Profile): void => {
    if (profiles.length <= 1) return
    if (window.confirm(t('profile.deleteConfirm', { name: p.name }))) onRemove(p.id)
  }

  const field =
    'w-full rounded-lg border border-edge bg-bar px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fgmuted focus:border-accent focus:ring-2 focus:ring-accentBorder'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-edge px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accentBg text-accent ring-1 ring-inset ring-accentBorder">
            <ProfileGlyph />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {t('profile.manageTitle')}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-fgdim">
              {t('profile.manageDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fgmuted transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={t('window.close')}
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="min-h-0 space-y-2 overflow-y-auto px-5 py-5">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <input
                value={draftFor(p)}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                onBlur={() => commit(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }}
                className={field}
                autoComplete="off"
                aria-label={t('profile.name')}
              />
              {p.id === activeProfileId && (
                <span className="shrink-0 rounded-md bg-accentBg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent ring-1 ring-inset ring-accentBorder">
                  {t('profile.active')}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={profiles.length <= 1}
                title={t('profile.delete')}
                aria-label={t('profile.delete')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fgmuted transition hover:bg-hover hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fgmuted"
              >
                <TrashGlyph />
              </button>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-edge bg-bar/50 px-5 py-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitNew()
              }
            }}
            placeholder={t('profile.addPlaceholder')}
            className={field}
            autoComplete="off"
            aria-label={t('profile.add')}
          />
          <button
            type="button"
            onClick={submitNew}
            disabled={!newName.trim()}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bar transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
          >
            {t('profile.add')}
          </button>
        </div>
      </div>
    </div>
  )
}
