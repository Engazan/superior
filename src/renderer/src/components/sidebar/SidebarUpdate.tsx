import { useI18n } from '../../i18n'
import type { UpdateController } from '../../hooks/useUpdateCheck'
import { ChevronIcon, ExternalLinkIcon, RefreshIcon } from '../ui'
import { UpdateGlyph, updateTitle } from './parts'

/** One quiet sidebar action, shared by the expanded sidebar and compact rail. */
export function SidebarUpdate({ update, collapsed = false }: {
  update: UpdateController
  collapsed?: boolean
}): React.JSX.Element | null {
  const { t } = useI18n()
  if (!update.info?.updateAvailable) return null

  const { phase } = update.progress
  const downloading = phase === 'downloading'
  const ready = phase === 'downloaded'
  const failed = phase === 'error'
  const percent = Math.round(Math.max(0, Math.min(100, update.progress.percent ?? 0)))
  const label = downloading
    ? t('update.downloading', { percent: String(percent) })
    : t(ready ? 'update.restart' : failed ? 'update.openPage' : 'update.action')
  const detail = failed
    ? t('update.failed')
    : t('update.available', { version: update.info.latestVersion ?? '' })
  const icon = ready
    ? <RefreshIcon size={16} />
    : failed ? <ExternalLinkIcon size={16} /> : <UpdateGlyph />

  return (
    <div className="shrink-0 border-t border-edge p-2">
      <button
        type="button"
        disabled={downloading}
        onClick={ready
          ? update.installAndRestart
          : failed
            ? () => window.api.openReleasePage(update.info?.releaseUrl ?? '')
            : update.startDownload}
        title={updateTitle(update, t)}
        aria-label={`${label} · ${detail}`}
        className={`group relative overflow-hidden border border-edge bg-bar text-left transition-colors hover:border-accentBorder hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default disabled:hover:border-edge disabled:hover:bg-bar ${
          collapsed ? 'mx-auto flex h-8 w-8 items-center justify-center rounded-md' : 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5'
        }`}
      >
        <span className={`flex shrink-0 items-center justify-center ${collapsed ? 'h-5 w-5 rounded-sm' : 'h-7 w-7 rounded-md'} ${
          ready ? 'bg-statusBg text-status' : failed ? 'bg-warnBg text-warn' : 'bg-accentBg text-accent'
        }`}>
          {icon}
        </span>
        {!collapsed && <>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium leading-4 text-fg">{label}</span>
            <span className="mt-0.5 block text-[10px] leading-4 text-fgdim">{detail}</span>
          </span>
          {!downloading && <ChevronIcon direction="right" size={12} className="shrink-0 text-fgmuted transition-colors group-hover:text-fg" />}
        </>}
        {collapsed && !downloading && <span aria-hidden className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${ready ? 'bg-status' : failed ? 'bg-warn' : 'bg-accent'}`} />}
        {downloading && <span
          role="progressbar"
          aria-label={t('update.action')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-edge"
        >
          <span className="block h-full bg-accent transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </span>}
      </button>
    </div>
  )
}
