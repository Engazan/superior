import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useOverlayLayer } from '../overlayStack'
import type { AccountUsage, UiState, UsageProfile, UsageWindow } from '../types'
import { builtinIcon } from '@shared/icons'
import { IconButton, RefreshIcon, useConfirm, useToast } from './ui'

export function tightestWindow(windows: UsageWindow[]): UsageWindow | undefined {
  return windows.reduce<UsageWindow | undefined>((best, window) =>
    !best || window.usedPercent > best.usedPercent ? window : best, undefined)
}

function color(used: number): string {
  return used >= 95 ? 'var(--c-danger)' : used >= 80 ? 'var(--c-warn)' : 'var(--c-status)'
}

function UsageDetail({ children, onClose }: {
  children: React.ReactNode
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const layer = useOverlayLayer()
  const { t } = useI18n()
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const outside = (event: MouseEvent): void => {
      if (layer.isTop() && !ref.current?.contains(event.target as Node)) onClose()
    }
    const key = (event: KeyboardEvent): void => {
      if (!layer.isTop()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
      if (event.key === 'Tab') {
        const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select') ?? [])
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('mousedown', outside)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', outside)
      window.removeEventListener('keydown', key)
      if (opener?.isConnected) opener.focus()
    }
  }, [onClose, layer])
  return (
    <div ref={ref} role="dialog" aria-label={t('footer.title')} aria-modal="true"
      className="solid-surface absolute bottom-full right-2 mb-2 flex max-h-[70vh] w-[460px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-xl">
      {children}
    </div>
  )
}

export function UsageFooter({ onManage }: { onManage: () => void }): React.JSX.Element {
  const { t, lang } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const [applying, setApplying] = useState(false)
  const resetLock = useRef(false)
  const resetKeys = useRef(new Map<string, string>())
  const [profiles, setProfiles] = useState<UsageProfile[]>([])
  const [selected, setSelected] = useState<string[]>(['claude:default', 'codex:default'])
  const [remaining, setRemaining] = useState(true)
  const [compact, setCompact] = useState(false)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [readings, setReadings] = useState<Record<string, AccountUsage>>({})
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [hover, setHover] = useState<{ id: string; left: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearHoverTimer = (): void => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }
  const hideHover = (): void => {
    clearHoverTimer()
    hoverTimer.current = setTimeout(() => setHover(null), 150)
  }
  const showHover = (id: string, element: HTMLElement): void => {
    clearHoverTimer()
    const footer = element.closest('footer')!.getBoundingClientRect()
    setHover({ id, left: Math.max(8, Math.min(element.getBoundingClientRect().left - footer.left, footer.width - 348)) })
  }
  useEffect(() => {
    const dismiss = (event: KeyboardEvent): void => { if (event.key === 'Escape') setHover(null) }
    window.addEventListener('keydown', dismiss)
    return () => { window.removeEventListener('keydown', dismiss); if (hoverTimer.current) clearTimeout(hoverTimer.current) }
  }, [])
  const closeRef = useRef(() => setOpen(false))

  useEffect(() => {
    if (ready) return
    let live = true
    Promise.all([window.api.getUsageProfiles(), window.api.getSettings()]).then(([list, settings]) => {
      if (!live) return
      setProfiles(list)
      setSelected(settings.ui.usageFooterProfiles ?? ['claude:default', 'codex:default'])
      setRemaining(settings.ui.usageFooterRemaining ?? true)
      setCompact(settings.ui.usageFooterCompact ?? false)
      setReady(true)
    }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [ready, refresh])

  useEffect(() => {
    if (!ready || !open) return
    let live = true
    window.api.getUsageProfiles().then((list) => { if (live) setProfiles(list) }).catch(() => {})
    return () => { live = false }
  }, [open, ready])

  useEffect(() => {
    if (!ready || applying) return
    let live = true
    let running = false
    let force = refresh > 0
    const read = async (): Promise<void> => {
      if (running) return
      const ids = profiles.filter((profile) => open || selected.includes(profile.id)).map((profile) => profile.id)
      if (!ids.length) { setLoading(false); return }
      running = true
      setLoading(true)
      try {
        const values = await window.api.getAccountUsage(ids, force)
        force = false
        if (live) {
          setReadings((previous) => ({ ...previous, ...Object.fromEntries(values.map((value) => [value.profileId, value])) }))
          setFailed(false)
        }
      } catch { if (live) setFailed(true) }
      finally { running = false; if (live) setLoading(false) }
    }
    void read()
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void read() }, 60_000)
    return () => { live = false; window.clearInterval(timer) }
  }, [ready, profiles, selected, open, refresh, applying])

  const applyTicket = async (profile: UsageProfile, reading: AccountUsage): Promise<void> => {
    if (resetLock.current || !reading.authFingerprint) return
    resetLock.current = true
    setApplying(true)
    try {
      if (!await confirm({ title: t('footer.resetConfirm'),
        message: <><p>{t('footer.resetWarning')}</p><p className="mt-3 font-medium">{profile.name}</p><p className="break-all text-xs">{profile.directoryPath}</p></>,
        confirmLabel: 'CONFIRM', tone: 'danger' })) return
      const account = reading.authFingerprint
      const key = resetKeys.current.get(account) ?? crypto.randomUUID()
      resetKeys.current.set(account, key)
      const outcome = await window.api.consumeUsageReset({ profileId: profile.id, authFingerprint: account, idempotencyKey: key, confirmed: true })
      if (outcome !== 'unavailable' && outcome !== 'busy') resetKeys.current.delete(account)
      if (outcome === 'reset' || outcome === 'alreadyRedeemed') toast.success(t('footer.resetDone'))
      else toast.error(t(`footer.reset_${outcome}`))
    } catch { toast.error(t('footer.reset_unavailable')) }
    finally {
      resetLock.current = false
      setApplying(false)
      setRefresh((value) => value + 1)
    }
  }

  const persist = (patch: Partial<UiState>): void => {
    void window.api.setUiState(patch).catch(() => setFailed(true))
  }
  const percent = (window: UsageWindow): string => `${Math.round(remaining ? 100 - window.usedPercent : window.usedPercent)}%`
  const status = (reading?: AccountUsage): string => {
    if (!reading) return t(loading && !failed ? 'footer.loading' : 'footer.unavailable')
    return t(`footer.${reading.status === 'ready' ? 'noData' : reading.status}`)
  }
  const visible = profiles.filter((profile) => selected.includes(profile.id))
  const hoveredProfile = visible.find((profile) => profile.id === hover?.id)
  const hoveredReading = hoveredProfile ? readings[hoveredProfile.id] : undefined
  return (
    <footer className="relative z-40 flex h-8 shrink-0 items-center gap-2 border-t border-edge bg-panel px-3 text-[11px] text-fgmuted">
      <IconButton
        type="button"
        size="sm"
        label={t(loading ? 'footer.loading' : 'footer.refresh')}
        disabled={loading || applying}
        onClick={() => setRefresh((value) => value + 1)}
      >
        <RefreshIcon className={loading ? 'animate-spin' : undefined} />
      </IconButton>
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
        {visible.map((profile) => {
          const reading = readings[profile.id]
          const windows = reading?.windows ?? []
          const limits = (profile.provider === 'claude'
            ? [windows.find((limit) => limit.id === 'five_hour'), tightestWindow(windows.filter((limit) => limit.id !== 'five_hour'))]
            : [tightestWindow(windows)]).filter((limit): limit is UsageWindow => !!limit)
          return (
            <div key={profile.id} className="flex shrink-0 items-center gap-3 before:h-4 before:w-px before:bg-edge first:before:hidden">
            <button type="button" aria-haspopup="dialog" aria-expanded={open}
              onClick={() => { setHover(null); setOpen(true) }}
              onMouseEnter={(event) => showHover(profile.id, event.currentTarget)} onMouseLeave={hideHover}
              onFocus={(event) => showHover(profile.id, event.currentTarget)} onBlur={hideHover}
              aria-describedby={!open && hover?.id === profile.id ? 'usage-profile-tooltip' : undefined}
              className="flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50">
              <img src={builtinIcon(profile.provider)?.dataUrl} alt="" className={`h-3.5 w-3.5 object-contain ${profile.provider === 'codex' ? 'superior-usage-codex-icon' : ''}`} />
              <span className="font-medium text-fg">{profile.name}</span>
              {limits.length > 0 && reading?.status === 'ready' ? limits.map((limit) => (
                <span key={limit.id} className="ml-1 flex items-center gap-1.5">
                  <span className="text-fgmuted">{limit.label}</span>
                  <span className="min-w-[3rem] rounded bg-hover px-1.5 py-0.5 text-center font-semibold tabular-nums"
                    style={{ color: color(limit.usedPercent) }}>{percent(limit)}</span>
                </span>
              )) : <span className="text-fgdim">{status(reading)}</span>}
            </button>
            </div>
          )
        })}
      </div>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
        className="shrink-0 rounded px-2 py-1 hover:bg-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50">
        {t('footer.options')} ▴
      </button>
      {!open && hover && hoveredProfile && <div id="usage-profile-tooltip" role="tooltip"
        onMouseEnter={clearHoverTimer} onMouseLeave={hideHover}
        style={{ left: hover.left }}
        className="solid-surface absolute bottom-full mb-2 max-h-[65vh] w-[340px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-edge bg-panel p-3 text-xs text-fgmuted shadow-xl">
        <div className="flex items-center justify-between gap-2 font-semibold text-fg">
          <span>{hoveredProfile.name}</span><span>{hoveredReading?.plan}</span>
        </div>
        <p className="mt-1 break-all text-[10px] text-fgdim">{hoveredProfile.directoryPath}</p>
        {hoveredReading?.status === 'ready' ? hoveredReading.windows.map((limit) => <div key={limit.id} className="mt-3">
          <div className="flex justify-between gap-2"><span>{limit.label}</span>
            <span style={{ color: color(limit.usedPercent) }}>{percent(limit)} {t(remaining ? 'usage.remaining' : 'usage.used')}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hover"><div className="h-full rounded-full"
            style={{ width: `${remaining ? 100 - limit.usedPercent : limit.usedPercent}%`, backgroundColor: color(limit.usedPercent) }} /></div>
          {limit.resetsAt && <p className="mt-1 text-[10px] text-fgdim">{t('usage.resets')} {new Date(limit.resetsAt).toLocaleString(lang)}</p>}
        </div>) : <p className="mt-2">{status(hoveredReading)}</p>}
        {hoveredProfile.provider === 'codex' && <div className="mt-3 border-t border-edge pt-2">
          <p>{t('footer.tickets')}: {hoveredReading?.resetCredits?.availableCount ?? '—'}</p>
          {!hoveredReading?.resetCredits ? <p>{t('footer.ticketsUnknown')}</p>
            : hoveredReading.resetCredits.availableCount === 0 ? <p>{t('footer.noTickets')}</p> : <>
              {hoveredReading.resetCredits.credits?.map((ticket, index) => <p key={index} className="mt-1 text-[10px] text-fgdim">
                #{index + 1} · {ticket.expiresAt ? `${t('footer.ticketExpires')} ${new Date(ticket.expiresAt).toLocaleString(lang)}` : t('footer.ticketNoExpiry')}
              </p>)}
              {(hoveredReading.resetCredits.credits?.length ?? 0) < hoveredReading.resetCredits.availableCount && <p>{t('footer.ticketDetailsUnknown')}</p>}
            </>}
        </div>}
        {hoveredReading && <p className="mt-2 text-[10px] text-fgdim">{t('footer.updated')} {new Date(hoveredReading.updatedAt).toLocaleTimeString(lang)}</p>}
        <p className="mt-2 text-[10px] text-fgdim">{t('footer.sharedLimit')}</p>
      </div>}
      {open && <UsageDetail onClose={closeRef.current}>
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <span className="text-sm font-semibold text-fg">{t('footer.title')}</span>
          <div className="flex gap-2">
            <button type="button" disabled={loading || applying} onClick={() => setRefresh((value) => value + 1)}
              className="rounded px-2 py-1 hover:bg-hover disabled:opacity-40">{loading ? t('footer.loading') : t('footer.refresh')}</button>
            <button type="button" onClick={closeRef.current} aria-label={t('footer.close')} className="rounded px-2 hover:bg-hover">×</button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-edge px-4 py-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={remaining} onChange={(event) => {
              setRemaining(event.target.checked); persist({ usageFooterRemaining: event.target.checked })
            }} />{t('footer.remaining')}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={compact} onChange={(event) => {
              setCompact(event.target.checked); persist({ usageFooterCompact: event.target.checked })
            }} />{t('footer.compact')}
          </label>
        </div>
        <div className="min-h-0 overflow-y-auto">
          {profiles.map((profile) => {
            const reading = readings[profile.id]
            const windows = reading?.windows ?? []
            const tightest = tightestWindow(windows)
            const displayed = compact ? tightest ? [tightest] : [] : windows
            return (
              <section key={profile.id} className="border-b border-edge px-4 py-3 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex min-w-0 items-center gap-2 font-medium text-fg">
                    <input type="checkbox" checked={selected.includes(profile.id)} aria-label={`${t('footer.show')} ${profile.name}`}
                      onChange={(event) => {
                        const next = event.target.checked ? [...selected, profile.id] : selected.filter((id) => id !== profile.id)
                        setSelected(next); persist({ usageFooterProfiles: next })
                      }} />
                    <span className="truncate">{profile.name}</span>
                  </label>
                  {reading?.plan && <span className="shrink-0 rounded border border-edge px-1.5 py-0.5">{reading.plan}</span>}
                </div>
                <div className="mt-1 truncate text-[10px] text-fgdim" title={profile.directoryPath}>{profile.directoryPath}</div>
                {reading?.status === 'ready' ? displayed.map((limit) => (
                  <div key={limit.id} className="mt-2">
                    <div className="mb-1 flex justify-between gap-2">
                      <span>{limit.label}</span>
                      <span style={{ color: color(limit.usedPercent) }}>{percent(limit)} {t(remaining ? 'usage.remaining' : 'usage.used')}</span>
                    </div>
                    <div role="progressbar" aria-label={`${profile.name} ${limit.label} ${t(remaining ? 'usage.remaining' : 'usage.used')}`}
                      aria-valuenow={remaining ? 100 - limit.usedPercent : limit.usedPercent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-hover">
                      <div className="h-full rounded-full" style={{ width: `${remaining ? 100 - limit.usedPercent : limit.usedPercent}%`, backgroundColor: color(limit.usedPercent) }} />
                    </div>
                    {limit.resetsAt && <div className="mt-1 text-[10px] text-fgdim">{t('usage.resets')} {new Date(limit.resetsAt).toLocaleString(lang)}</div>}
                  </div>
                )) : <div className="mt-2 text-fgdim">{status(reading)}</div>}
                {profile.provider === 'codex' && <div className="mt-3 rounded border border-edge p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">{t('footer.tickets')}: {reading?.resetCredits?.availableCount ?? '—'}</span>
                    <button type="button" disabled={applying || loading || !reading?.authFingerprint || !reading.resetCredits?.availableCount}
                      onClick={() => { if (reading) void applyTicket(profile, reading) }}
                      className="rounded border border-edge px-2 py-1 text-fg hover:bg-hover disabled:opacity-40">{t(applying ? 'footer.applying' : 'footer.applyTicket')}</button>
                  </div>
                  {!reading?.resetCredits ? <p className="mt-1 text-fgdim">{t('footer.ticketsUnknown')}</p>
                    : reading.resetCredits.availableCount === 0 ? <p className="mt-1 text-fgdim">{t('footer.noTickets')}</p>
                    : <>
                      {reading.resetCredits.credits?.map((ticket, index) => <p key={index} className="mt-1 text-fgdim">
                        #{index + 1} · {ticket.expiresAt ? `${t('footer.ticketExpires')} ${new Date(ticket.expiresAt).toLocaleString(lang)}` : t('footer.ticketNoExpiry')}
                      </p>)}
                      {(reading.resetCredits.credits?.length ?? 0) < reading.resetCredits.availableCount && <p className="mt-1 text-fgdim">{t('footer.ticketDetailsUnknown')}</p>}
                    </>}
                </div>}
                {reading && <div className="mt-2 text-[10px] text-fgdim">{t('footer.updated')} {new Date(reading.updatedAt).toLocaleTimeString(lang)}</div>}
              </section>
            )
          })}
          {failed && <p className="px-4 py-2 text-danger">{t('footer.unavailable')}</p>}
        </div>
        <div className="border-t border-edge px-4 py-3">
          <p className="mb-2 text-[10px] text-fgdim">{t('footer.sharedLimit')}</p>
          <button type="button" onClick={() => { setOpen(false); onManage() }} className="rounded px-2 py-1 text-fg hover:bg-hover">{t('footer.manage')}</button>
        </div>
      </UsageDetail>}
    </footer>
  )
}
