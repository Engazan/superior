import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import {
  Button,
  ColorSwatchPicker,
  IconButton,
  Input,
  Modal,
  TrashIcon,
  useConfirm,
  useDismiss,
  useToast
} from './ui'
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

/**
 * The "Manage profiles" modal: add, rename, and delete profiles. Renaming
 * commits on blur or Enter; deleting a profile removes all of its folders, so it
 * confirms first and is blocked for the last remaining profile. Built on the UI
 * kit (Modal/Input/Button/IconButton) — it used to hand-roll all of them.
 */
export function ProfileManager({
  profiles,
  activeProfileId,
  onAdd,
  onRename,
  onUpdateColor,
  onRemove,
  onClose
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const [newName, setNewName] = useState('')
  const newNameRef = useRef<HTMLInputElement>(null)
  // Local draft of each profile's name, keyed by id, so typing stays responsive.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // The open color popover: which profile and where to anchor it (the swatch
  // button's bottom-right, in viewport coords, since the list scrolls/clips).
  const [colorPicker, setColorPicker] = useState<{ id: string; x: number; y: number } | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // The popover registers on the overlay stack (via useDismiss), so Escape
  // closes it first and the Modal underneath only closes on the next press.
  useDismiss(pickerRef, colorPicker !== null, () => setColorPicker(null))

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

  const remove = async (p: Profile): Promise<void> => {
    if (profiles.length <= 1) return
    const ok = await confirm({
      title: t('profile.deleteTitle'),
      message: t('profile.deleteConfirm', { name: p.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    })
    if (ok) {
      onRemove(p.id)
      toast.success(t('toast.profileDeleted', { name: p.name }))
    }
  }

  return (
    <Modal
      size="lg"
      title={
        <span className="flex items-center gap-2.5">
          {t('profile.manageTitle')}
          <span className="rounded-md border border-edge bg-bar px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-fgmuted">{profiles.length}</span>
        </span>
      }
      description={t('profile.manageDescription')}
      onClose={onClose}
      closeLabel={t('window.close')}
      initialFocusRef={newNameRef}
      footer={
        <form className="w-full rounded-xl border border-edge bg-bar/60 p-3.5"
          onSubmit={(event) => { event.preventDefault(); submitNew() }}>
          <label className="mb-2 block text-xs font-medium text-fgdim" htmlFor="new-profile-name">{t('profile.add')}</label>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              ref={newNameRef}
              id="new-profile-name"
              className="min-w-0 flex-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('profile.addPlaceholder')}
              autoComplete="off"
            />
            <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={!newName.trim()}>
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M8 3v10M3 8h10" /></svg>
              {t('profile.add')}
            </Button>
          </div>
        </form>
      }
    >
      <ul className="space-y-2 py-1">
        {profiles.map((p) => (
          <li key={p.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-edge bg-bar/30 p-3">
            <button
              type="button"
              aria-label={`${t('profile.color')}: ${p.name}`}
              title={t('profile.color')}
              aria-haspopup="menu"
              aria-expanded={colorPicker?.id === p.id}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setColorPicker((cur) => cur?.id === p.id ? null : {
                  id: p.id,
                  x: Math.min(window.innerWidth - 12, r.left + 176),
                  y: Math.max(12, Math.min(window.innerHeight - 240, r.bottom + 8))
                })
              }}
              className="group relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-edge bg-hover text-sm font-semibold text-fg transition hover:border-fgmuted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              style={p.color ? {
                backgroundColor: `color-mix(in srgb, ${p.color} 16%, var(--c-panel))`,
                borderColor: `color-mix(in srgb, ${p.color} 35%, var(--c-edge))`
              } : undefined}
            >
              <span aria-hidden>{Array.from(p.name.trim())[0]?.toLocaleUpperCase() ?? '?'}</span>
              <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel bg-fgmuted" style={p.color ? { backgroundColor: p.color } : undefined} />
            </button>
            <div className="min-w-0 flex-1">
              <input
                className="h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-fg transition hover:border-edge focus:border-edge focus:bg-panel focus:outline-hidden focus:ring-2 focus:ring-accent/30"
                value={draftFor(p)}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                onBlur={() => commit(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }}
                autoComplete="off"
                aria-label={`${t('profile.name')}: ${p.name}`}
              />
            </div>
            {p.id === activeProfileId && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accentBg px-2 py-1 text-[10px] font-medium text-accent">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m2.5 6 2 2 5-5" /></svg>
                {t('profile.active')}
              </span>
            )}
            <IconButton
              label={`${t('profile.delete')}: ${p.name}`}
              variant="danger-ghost"
              disabled={profiles.length <= 1}
              onClick={() => void remove(p)}
            >
              <TrashIcon size={15} />
            </IconButton>
          </li>
        ))}
      </ul>

      {/* Color palette popover, anchored to the clicked swatch (viewport coords
          so the scrolling/clipping list never cuts it off). */}
      {colorPicker &&
        (() => {
          const p = profiles.find((x) => x.id === colorPicker.id)
          if (!p) return null
          return (
            <div
              ref={pickerRef}
              role="menu"
              style={{ top: colorPicker.y, left: colorPicker.x }}
              className="solid-surface fixed z-60 w-44 -translate-x-full rounded-lg border border-edge bg-panel p-2 shadow-2xl"
            >
              <ColorSwatchPicker
                color={p.color ?? null}
                none={false}
                onChange={(c) => onUpdateColor(p.id, c)}
                onSwatchPick={() => setColorPicker(null)}
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateColor(p.id, null)
                  setColorPicker(null)
                }}
                className="mt-2 w-full rounded-md border border-edge px-2 py-1 text-xs text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('form.colorNone')}
              </button>
            </div>
          )
        })()}
    </Modal>
  )
}
