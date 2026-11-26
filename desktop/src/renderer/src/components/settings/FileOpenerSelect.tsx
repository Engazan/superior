import { useState } from 'react'
import { useI18n } from '../../i18n'
import { Menu } from '../ui'
import type { FileOpener } from '../../types'

// Fixed product names — not translated. Badge = brand color + monogram, so the
// options scan visually without shipping (trademarked) logo artwork.
const FILE_OPENER_OPTIONS: {
  value: FileOpener
  label: string
  color?: string
  monogram?: string
}[] = [
  { value: 'superior', label: 'Superior', color: '#e67861', monogram: 'S' },
  { value: 'system', label: '' }, // label resolved via i18n at render time
  { value: 'vscode', label: 'Visual Studio Code', color: '#007acc', monogram: 'VS' },
  { value: 'cursor', label: 'Cursor', color: '#1a1a1a', monogram: 'C' },
  { value: 'zed', label: 'Zed', color: '#2472f2', monogram: 'Z' },
  { value: 'sublime', label: 'Sublime Text', color: '#ff9800', monogram: 'S' },
  { value: 'phpstorm', label: 'PhpStorm', color: '#a347ff', monogram: 'PS' },
  { value: 'webstorm', label: 'WebStorm', color: '#07a3f2', monogram: 'WS' }
]

/** Small brand badge (or a monitor glyph for the OS default). */
function EditorBadge({ opener }: { opener: FileOpener }): React.JSX.Element {
  const opt = FILE_OPENER_OPTIONS.find((o) => o.value === opener)
  if (!opt?.color || !opt.monogram) {
    return (
      <svg
        className="h-4 w-4 shrink-0 text-fgmuted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
        <path d="M6 14h4M8 11.5V14" />
      </svg>
    )
  }
  return (
    <span
      aria-hidden
      style={{ backgroundColor: opt.color }}
      className="grid h-4 w-4 shrink-0 place-items-center rounded-sm text-[7px] font-bold leading-none text-white ring-1 ring-inset ring-white/20"
    >
      {opt.monogram}
    </span>
  )
}

/** Icon-capable replacement for the native select (options can't render icons). */
export function FileOpenerSelect({
  value,
  onChange
}: {
  value: FileOpener
  onChange: (next: FileOpener) => void
}): React.JSX.Element {
  const { t } = useI18n()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const labelOf = (opener: FileOpener): string =>
    opener === 'system'
      ? t('fileOpener.system')
      : (FILE_OPENER_OPTIONS.find((o) => o.value === opener)?.label ?? opener)

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-label={t('fileOpener.title')}
        onClick={(e) => setAnchor((cur) => (cur ? null : e.currentTarget))}
        className="flex h-8 w-56 max-w-full items-center gap-2 rounded-md border border-edge bg-bar px-2.5 text-sm text-fg transition hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <EditorBadge opener={value} />
        <span className="min-w-0 flex-1 truncate text-left">{labelOf(value)}</span>
        <svg
          className="h-3 w-3 shrink-0 text-fgmuted"
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
      </button>
      {anchor && (
        <Menu
          anchor={anchor}
          onClose={() => setAnchor(null)}
          items={FILE_OPENER_OPTIONS.map((opt) => ({
            id: opt.value,
            label: opt.value === 'system' ? t('fileOpener.system') : opt.label,
            icon: <EditorBadge opener={opt.value} />,
            onSelect: () => onChange(opt.value)
          }))}
        />
      )}
    </>
  )
}
