import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import type { Profile } from '../types'

interface Props {
  profiles: Profile[]
  activeProfileId: string | null
  onSelect: (id: string) => void
  onManage: () => void
}

function ProfileGlyph(): JSX.Element {
  return (
    <svg
      className="block h-3.5 w-3.5 shrink-0"
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

function Chevron(): JSX.Element {
  return (
    <svg
      className="block h-3 w-3 shrink-0 text-fgmuted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function CheckGlyph(): JSX.Element {
  return (
    <svg
      className="block h-3.5 w-3.5 shrink-0 text-accent"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/**
 * The PROFILE switch that lives in the center of the title bar. Opens a dropdown
 * to pick a profile (each profile owns its own folders) plus a "Manage profiles…"
 * entry that opens the management modal.
 */
export function ProfileSwitcher({ profiles, activeProfileId, onSelect, onManage }: Props): JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = profiles.find((p) => p.id === activeProfileId) ?? null

  // Close on outside click or Escape.
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

  return (
    <div ref={ref} className="app-no-drag relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('profile.switch')}
        aria-label={t('profile.switch')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 max-w-[14rem] items-center gap-1.5 rounded-md border border-edge bg-bar/60 px-2.5 text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ProfileGlyph />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-fgmuted">
          {t('profile.label')}
        </span>
        <span className="truncate text-xs font-medium text-fg">{active?.name ?? '—'}</span>
        <Chevron />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-8 z-50 min-w-52 -translate-x-1/2 overflow-hidden rounded-md border border-edge bg-panel py-1 shadow-lg"
        >
          {profiles.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={p.id === activeProfileId}
              onClick={() => {
                setOpen(false)
                onSelect(p.id)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg transition hover:bg-hover"
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {p.id === activeProfileId && <CheckGlyph />}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          <div className="my-1 border-t border-edge" />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fgdim transition hover:bg-hover hover:text-fg"
          >
            <svg
              className="block h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {t('profile.manage')}
          </button>
        </div>
      )}
    </div>
  )
}
