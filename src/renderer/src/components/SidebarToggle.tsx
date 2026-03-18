import { useI18n } from '../i18n'
import { useShortcutTitle } from '../shortcuts'

interface Props {
  onClick: () => void
}

export function SidebarToggle({ onClick }: Props): JSX.Element {
  const { t } = useI18n()
  const shortcutTitle = useShortcutTitle()
  return (
    <button
      onClick={onClick}
      className="group app-no-drag grid h-full w-8 place-items-center rounded p-0 text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      aria-label={t('common.toggleSidebar')}
      title={shortcutTitle(t('common.toggleSidebar'), 'toggleSidebar')}
    >
      <svg
        className="block h-[15px] w-[15px] transition-transform duration-150 group-active:scale-90"
        viewBox="0 0 15 15"
        fill="none"
        aria-hidden
      >
        <rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" />
        <line x1="5.5" y1="2.5" x2="5.5" y2="12.5" stroke="currentColor" />
      </svg>
    </button>
  )
}
