interface Props {
  onClick: () => void
}

export function SidebarToggle({ onClick }: Props): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="app-no-drag flex h-6 w-6 items-center justify-center rounded text-fgdim transition hover:bg-hover hover:text-fg"
      aria-label="Toggle sidebar"
      title="Toggle sidebar"
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
        <rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" />
        <line x1="5.5" y1="2.5" x2="5.5" y2="12.5" stroke="currentColor" />
      </svg>
    </button>
  )
}
