import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n'
import type { Profile } from '../types'

interface Props {
  profiles: Profile[]
  activeProfileId: string | null
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  /** Set a profile's accent color (null clears it). Tints the title bar + sidebar. */
  onUpdateColor: (id: string, color: string | null) => void
  onRemove: (id: string) => void
  onClose: () => void
}

// Same palette the folder editor offers, so profile + folder accents stay coherent.
const PROFILE_COLOR_SWATCHES = ['#D97757', '#10A37F', '#3B82F6', '#A855F7', '#EAB308', '#EF4444']

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

function PaletteGlyph(): JSX.Element {
  return (
    <svg
      className="h-4 w-4 text-fgmuted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.012 17.5 2 12 2Z" />
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
  onUpdateColor,
  onRemove,
  onClose
}: Props): JSX.Element {
  const { t } = useI18n()
  const [newName, setNewName] = useState('')
  // Local draft of each profile's name, keyed by id, so typing stays responsive.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // The open color popover: which profile and where to anchor it (the swatch
  // button's bottom-right, in viewport coords, since the list scrolls/clips).
  const [colorPicker, setColorPicker] = useState<{ id: string; x: number; y: number } | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  // Escape closes the color popover first, then the whole modal.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (colorPicker) setColorPicker(null)
      else onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, colorPicker])

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

              {/* Color swatch — click to open the palette popover (next to delete). */}
              <button
                type="button"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setColorPicker((cur) =>
                    cur?.id === p.id ? null : { id: p.id, x: r.right, y: r.bottom + 6 }
                  )
                }}
                title={t('profile.color')}
                aria-label={t('profile.color')}
                aria-haspopup="menu"
                aria-expanded={colorPicker?.id === p.id}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge transition hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {p.color ? (
                  <span
                    className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/20"
                    style={{ backgroundColor: p.color }}
                  />
                ) : (
                  <PaletteGlyph />
                )}
              </button>

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

        {/* Color palette popover, anchored to the clicked swatch (viewport coords
            so the scrolling/clipping list never cuts it off). */}
        {colorPicker &&
          (() => {
            const p = profiles.find((x) => x.id === colorPicker.id)
            if (!p) return null
            return (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setColorPicker(null)} />
                <div
                  role="menu"
                  style={{ top: colorPicker.y, left: colorPicker.x }}
                  className="fixed z-50 w-44 -translate-x-full rounded-lg border border-edge bg-panel p-2 shadow-2xl"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PROFILE_COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          onUpdateColor(p.id, c)
                          setColorPicker(null)
                        }}
                        title={c}
                        aria-label={c}
                        className={`h-7 w-7 rounded-md border ${
                          p.color?.toLowerCase() === c.toLowerCase()
                            ? 'border-accent ring-1 ring-accent'
                            : 'border-edge'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <label
                      title={t('form.colorCustom')}
                      className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-edge"
                      style={{ backgroundColor: p.color ?? 'transparent' }}
                    >
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-fgdim">
                        +
                      </span>
                      <input
                        type="color"
                        value={p.color ?? '#888888'}
                        onChange={(e) => onUpdateColor(p.id, e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateColor(p.id, null)
                      setColorPicker(null)
                    }}
                    className="mt-2 w-full rounded-md border border-edge px-2 py-1 text-xs text-fgdim transition hover:bg-hover hover:text-fg"
                  >
                    {t('form.colorNone')}
                  </button>
                </div>
              </>
            )
          })()}
      </div>
    </div>
  )
}
