import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { CheckIcon, ChevronIcon, GearIcon, useDismiss } from './ui'
import type { Profile } from '../types'

interface Props {
  profiles: Profile[]
  activeProfileId: string | null
  onSelect: (id: string) => void
  onManage: () => void
}

/** Item shape shared with ui/Menu so every dropdown reads the same. */
const ITEM =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-hover focus-visible:bg-hover focus-visible:outline-hidden'

/**
 * The compact profile switcher on the right of the title bar. Opens a dropdown
 * to pick a profile (each profile owns its own folders) plus a "Manage profiles…"
 * entry that opens the management modal. Hand-rolled rather than ui/Menu only
 * because rows are radio items with a check + color swatch.
 */
export function ProfileSwitcher({ profiles, activeProfileId, onSelect, onManage }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = profiles.find((p) => p.id === activeProfileId) ?? null

  // Close on outside click or Escape.
  useDismiss(ref, open, () => setOpen(false))

  // Menu keyboard model (matching ui/Menu): focus lands on the checked (or
  // first) item, ArrowUp/Down roves, closing restores focus to the trigger.
  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return
    const opener = document.activeElement as HTMLElement | null
    const first =
      menu.querySelector<HTMLButtonElement>('button[aria-checked="true"]') ??
      menu.querySelector<HTMLButtonElement>('button')
    first?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button'))
      if (buttons.length === 0) return
      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next =
        e.key === 'ArrowDown'
          ? buttons[(idx + 1) % buttons.length]
          : buttons[(idx - 1 + buttons.length) % buttons.length]
      next.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [open])

  return (
    <div ref={ref} className="app-no-drag relative min-w-0 max-w-64">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={active ? `${t('profile.switch')}: ${active.name}` : t('profile.switch')}
        aria-label={active ? `${t('profile.switch')}: ${active.name}` : t('profile.switch')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="superior-profile-switch flex h-8 max-w-full items-center gap-2 rounded-lg border border-edge bg-bar px-2.5 text-fgdim transition hover:bg-hover hover:text-fg aria-expanded:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full bg-fgmuted"
          style={active?.color ? { backgroundColor: active.color } : undefined}
          aria-hidden
        />
        <span className="truncate text-xs font-medium text-fg">{active?.name ?? '—'}</span>
        <ChevronIcon size={12} className="shrink-0 text-fgmuted" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('profile.switch')}
          className="solid-surface absolute right-0 top-full z-50 mt-1 max-h-[calc(100vh-80px)] w-60 max-w-[calc(100vw-32px)] overflow-y-auto rounded-lg border border-edge bg-panel py-1 shadow-xl"
        >
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={p.id === activeProfileId}
              title={p.name}
              onClick={() => {
                setOpen(false)
                onSelect(p.id)
              }}
              className={`${ITEM} text-fg`}
            >
              <span className="flex w-4 shrink-0 justify-center text-accent">
                {p.id === activeProfileId && <CheckIcon size={13} />}
              </span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10 bg-fgmuted"
                style={p.color ? { backgroundColor: p.color } : undefined}
                aria-hidden
              />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          <div className="my-1 border-t border-edge" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
            className={`${ITEM} text-fgdim hover:text-fg`}
          >
            <span className="flex w-4 shrink-0 justify-center">
              <GearIcon size={13} />
            </span>
            {t('profile.manage')}
          </button>
        </div>
      )}
    </div>
  )
}
