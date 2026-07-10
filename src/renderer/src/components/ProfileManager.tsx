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

function PaletteGlyph(): React.JSX.Element {
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
      title={t('profile.manageTitle')}
      description={t('profile.manageDescription')}
      onClose={onClose}
      closeLabel={t('window.close')}
    >
      <div className="space-y-2">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <Input
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
              aria-label={t('profile.name')}
            />
            {p.id === activeProfileId && (
              <span className="shrink-0 rounded-md bg-accentBg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent ring-1 ring-inset ring-accentBorder">
                {t('profile.active')}
              </span>
            )}

            {/* Color swatch — click to open the palette popover (next to delete). */}
            <IconButton
              label={t('profile.color')}
              aria-haspopup="menu"
              aria-expanded={colorPicker?.id === p.id}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setColorPicker((cur) =>
                  cur?.id === p.id ? null : { id: p.id, x: r.right, y: r.bottom + 6 }
                )
              }}
              className="border border-edge"
            >
              {p.color ? (
                <span
                  className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/20"
                  style={{ backgroundColor: p.color }}
                />
              ) : (
                <PaletteGlyph />
              )}
            </IconButton>

            <IconButton
              label={t('profile.delete')}
              variant="danger-ghost"
              disabled={profiles.length <= 1}
              onClick={() => void remove(p)}
            >
              <TrashIcon size={15} />
            </IconButton>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-edge pt-4">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitNew()
            }
          }}
          placeholder={t('profile.addPlaceholder')}
          autoComplete="off"
          aria-label={t('profile.add')}
        />
        <Button variant="primary" disabled={!newName.trim()} onClick={submitNew}>
          {t('profile.add')}
        </Button>
      </div>

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
