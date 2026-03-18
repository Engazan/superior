import { useI18n } from '../i18n'

interface Props {
  /** Short explanation shown under the title (already localized). */
  reason?: string
  onOpenRaw: () => void
}

/** Fallback for binaries, PDFs and oversized files: a note plus open-raw. */
export function UnsupportedFilePreview({ reason, onOpenRaw }: Props): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <svg
          className="h-10 w-10 text-fgmuted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
        </svg>
        <div className="text-sm font-medium text-fg">{t('preview.notAvailable')}</div>
        {reason && <div className="max-w-xs text-xs text-fgmuted">{reason}</div>}
        <button
          onClick={onOpenRaw}
          className="mt-1 rounded border border-edge px-3 py-1.5 text-xs font-medium text-fgdim transition hover:bg-hover hover:text-fg"
        >
          {t('preview.openRaw')}
        </button>
      </div>
    </div>
  )
}
