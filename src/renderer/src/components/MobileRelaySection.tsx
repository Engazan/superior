import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { MobileRelayInvite, MobileRelayStatus } from '@shared/mobileRelay'
import { Button, CheckIcon, Modal, PhoneIcon, SectionHeader } from './ui'

export function MobileAccessModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  return <Modal onClose={onClose} title="Mobile access" description="Your workspace, connected to your phone." size="lg">
    <MobileRelaySection embedded />
  </Modal>
}

export function MobileRelaySection({ embedded = false }: { embedded?: boolean }): React.JSX.Element {
  const [status, setStatus] = useState<MobileRelayStatus | null>(null)
  const [url, setUrl] = useState('')
  const [invite, setInvite] = useState<MobileRelayInvite | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [paired, setPaired] = useState(false)
  const [expired, setExpired] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const active = useRef(false)
  const working = useRef(false)
  const autoPair = useRef(false)
  const currentInvite = useRef<MobileRelayInvite | null>(null)
  const initialized = useRef(false)
  const revision = useRef(0)

  const generate = useCallback(async (): Promise<void> => {
    if (working.current) return
    revision.current++
    working.current = true
    autoPair.current = false
    setBusy(true); setError(''); setPaired(false); setExpired(false)
    try {
      // Replacing a code also removes its unused invitation from the relay.
      if (currentInvite.current) {
        const previousId = currentInvite.current.deviceId
        const latest = await window.api.getMobileRelayStatus()
        if (!latest.devices.some(device => device.id === previousId && device.paired)) {
          await window.api.revokeMobileRelayDevice(previousId)
        }
      }
      currentInvite.current = null
      if (active.current) setInvite(null)
      const next = await window.api.createMobileRelayInvite()
      if (active.current) { currentInvite.current = next; setInvite(next); setNow(Date.now()) }
    } catch (err) {
      if (active.current) setError((err as Error).message)
    } finally {
      working.current = false
      if (active.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    active.current = true
    let refreshing = false
    const refresh = async (): Promise<void> => {
      if (refreshing || working.current) return
      refreshing = true
      const requestRevision = revision.current
      try {
        const next = await window.api.getMobileRelayStatus()
        if (!active.current || working.current || requestRevision !== revision.current) return
        setStatus(next)
        if (!initialized.current) {
          initialized.current = true
          setUrl(next.url)
          autoPair.current = next.enabled && !next.devices.some(device => device.paired)
        }
        const code = currentInvite.current
        if (code && next.devices.some(device => device.id === code.deviceId && device.paired)) {
          currentInvite.current = null; setInvite(null); setPaired(true); setExpired(false)
        }
        if (next.connected && autoPair.current) void generate()
      } catch (err) {
        if (active.current) setError((err as Error).message)
      } finally { refreshing = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => { active.current = false; window.clearInterval(timer) }
  }, [generate])

  useEffect(() => {
    if (!invite) return
    const tick = (): void => {
      const time = Date.now()
      setNow(time)
      if (time >= invite.expiresAt) { setInvite(null); setExpired(true) }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [invite])

  const run = async (action: () => Promise<MobileRelayStatus>, pairAfter = false): Promise<void> => {
    if (working.current) return
    revision.current++
    working.current = true; setBusy(true); setError('')
    try {
      const next = await action()
      if (!active.current) return
      setStatus(next)
      autoPair.current = pairAfter
      if (!next.enabled || pairAfter) {
        currentInvite.current = null; setInvite(null); setPaired(false); setExpired(false)
      }
    } catch (err) {
      autoPair.current = false
      if (active.current) setError((err as Error).message)
    } finally {
      working.current = false
      if (active.current) setBusy(false)
    }
    if (active.current && pairAfter && autoPair.current) {
      // Status polling generates the code as soon as authentication completes.
      try {
        const next = await window.api.getMobileRelayStatus()
        if (active.current) { setStatus(next); if (next.connected) await generate() }
      } catch (err) { if (active.current) setError((err as Error).message) }
    }
  }

  const connected = status?.connected === true
  const enabled = status?.enabled === true
  const devices = status?.devices.filter(device => device.paired) ?? []
  const remaining = invite ? Math.max(0, Math.ceil((invite.expiresAt - now) / 1000)) : 0
  const connection = !status ? 'Loading connection…' : connected ? 'Connected' : enabled ? status.error ? 'Connection unavailable' : 'Connecting…' : 'Mobile access is off'

  return <div className={embedded ? 'space-y-5' : 'settings-section space-y-5'}>
    {!embedded && <SectionHeader title="Mobile access" description="Your workspace, connected to your phone." />}
    <div className="flex items-center gap-3 rounded-xl border border-edge bg-bar p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-edge bg-panel text-fgdim"><PhoneIcon size={24} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">Take your workspace with you</p>
        <p className="mt-1 text-xs leading-relaxed text-fgdim">Access your running terminals from your phone. Keep Superior open on this computer.</p>
      </div>
    </div>
    <ol aria-label="Connection steps" className="flex gap-3 text-xs text-fgdim">
      {['Enable access', 'Scan QR code', 'Ready to connect'].map((label, index) => {
        const done = connected && (index === 0 || paired || (!invite && devices.length > 0))
        return <li key={label} className="flex flex-1 items-center gap-2"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? 'bg-accentSolid text-white' : 'border border-edge bg-bar text-fgdim'}`}>{done ? <CheckIcon size={12} /> : index + 1}</span><span>{label}</span></li>
      })}
    </ol>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge p-4">
      <div>
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-fg"><span aria-hidden className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : enabled ? 'bg-amber-500' : 'bg-fgmuted'}`} />{connection}</p>
        <p className="mt-1 text-xs text-fgdim">{enabled ? 'Your terminals stay on this computer.' : 'Enable access to create your pairing code.'}</p>
      </div>
      <Button variant={enabled ? 'secondary' : 'primary'} loading={busy && !invite} disabled={!status} onClick={() => void run(async () => {
        if (!enabled) {
          if (!url.trim() && !status?.url) throw new Error('Enter a relay address in Connection settings before enabling mobile access.')
          await window.api.setMobileRelayUrl(url.trim())
          return window.api.setMobileRelayEnabled(true)
        }
        return window.api.setMobileRelayEnabled(false)
      }, !enabled)}>{enabled ? 'Turn off' : 'Enable mobile access'}</Button>
    </div>
    {paired ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"><CheckIcon size={24} /></span>
      <h4 className="text-base font-semibold text-fg">Your phone is paired</h4>
      <p className="mt-2 text-sm text-fgdim">You can now connect to this computer from your phone.</p>
      <Button className="mt-4" variant="secondary" disabled={!connected || busy} onClick={() => void generate()}>Pair another phone</Button>
    </div> : enabled && <div className="rounded-xl border border-edge bg-bar p-5 text-center">
      <h4 className="text-sm font-semibold text-fg">{invite && connected ? 'Scan to pair your phone' : expired ? 'Your pairing code expired' : connected ? 'Pair your phone' : 'Waiting for connection'}</h4>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-fgdim">{invite && connected ? 'Open the pairing screen in the Superior mobile app and scan this code.' : expired ? 'Generate a fresh code when your phone is ready.' : connected ? 'Create a pairing code to securely connect a phone.' : 'Your QR code will appear here after the connection is ready.'}</p>
      {invite && connected ? <>
        <div className="mx-auto mt-5 w-fit max-w-full rounded-xl bg-white p-3 shadow-sm"><QRCodeSVG value={invite.pairing} size={240} level="M" marginSize={4} title="Scan to pair your phone with Superior" style={{ maxWidth: '100%', height: 'auto' }} /></div>
        <p className="mt-3 text-xs tabular-nums text-fgdim">Valid for {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
        <p className="mt-1 text-xs text-fgmuted">This code grants access to your computer. Keep it private.</p>
        <Button className="mt-3" size="sm" variant="ghost" loading={busy} onClick={() => void generate()}>Generate a new code</Button>
        <details className="mt-3 text-left text-xs text-fgdim"><summary className="cursor-pointer">Can’t scan? Use pairing data</summary><textarea readOnly aria-label="Pairing data" className="mt-2 h-20 w-full rounded-lg border border-edge bg-panel p-2 font-mono text-xs text-fg" value={invite.pairing} onFocus={e => e.currentTarget.select()} /></details>
      </> : <div className="mt-5">{connected ? <Button loading={busy} onClick={() => void generate()}>{expired ? 'Generate new QR code' : 'Show pairing QR code'}</Button> : <span aria-hidden className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-fgmuted" />}</div>}
    </div>}
    {(error || status?.error) && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-500">{error || status?.error}</p>}
    {devices.length > 0 && <div className="space-y-2">
      <h4 className="text-xs font-semibold text-fgdim">Paired devices · {devices.length}</h4>
      {devices.map((device, index) => <div key={device.id} className="flex items-center gap-3 rounded-lg border border-edge px-3 py-2.5">
        <PhoneIcon size={18} /><div className="min-w-0 flex-1"><p className="text-sm text-fg">Phone {index + 1}</p><p className="truncate text-xs text-fgmuted" title={device.id}>Paired {new Date(device.createdAt).toLocaleDateString()} · {device.id.slice(0, 8)}</p></div>
        <Button size="sm" variant="ghost" disabled={busy || !connected} onClick={() => void run(async () => { const next = await window.api.revokeMobileRelayDevice(device.id); if (active.current) setPaired(false); return next })}>Remove</Button>
      </div>)}
    </div>}
    <details open={!status || !status.url || !!status.error || !!error} className="rounded-lg border border-edge px-3 py-3 text-xs text-fgdim">
      <summary className="cursor-pointer font-medium">Connection settings</summary>
      <label htmlFor={embedded ? 'mobile-modal-relay-url' : 'mobile-relay-url'} className="mt-3 block">Relay address</label>
      <div className="mt-1.5 flex gap-2"><input id={embedded ? 'mobile-modal-relay-url' : 'mobile-relay-url'} className="min-w-0 flex-1 rounded-lg border border-edge bg-bar px-3 py-2 text-sm text-fg focus:outline-hidden focus:ring-2 focus:ring-accent/50" value={url} onChange={e => setUrl(e.target.value)} placeholder="wss://relay.example.com" disabled={busy || !status} spellCheck={false} />
        <Button variant="secondary" disabled={busy || !status || url.trim() === status.url} onClick={() => void run(() => window.api.setMobileRelayUrl(url.trim()), enabled)}>Save</Button></div>
      <p className="mt-2 leading-relaxed">Use your relay’s secure wss:// address. Save changes to reconnect.</p>
    </details>
    <p className="text-xs leading-relaxed text-fgmuted">The Superior mobile app is not available yet. You can prepare this computer for pairing here.</p>
  </div>
}
