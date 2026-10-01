import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { MobileRelayInvite, MobileRelayStatus } from '@shared/mobileRelay'
import { Button, SectionHeader, SettingRow, SettingsCard, Toggle } from './ui'

export function MobileRelaySection(): React.JSX.Element {
  const [status, setStatus] = useState<MobileRelayStatus | null>(null)
  const [url, setUrl] = useState('')
  const [invite, setInvite] = useState<MobileRelayInvite | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const refresh = (): void => {
      void window.api.getMobileRelayStatus().then((next) => {
        if (!active) return
        setStatus(next)
        setUrl((old) => old || next.url)
        setInvite((current) => current && next.devices.some((device) => device.id === current.deviceId && device.paired) ? null : current)
      }).catch((err) => { if (active) setError(String(err)) })
    }
    refresh()
    const timer = window.setInterval(refresh, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!invite) return
    const timer = window.setTimeout(() => setInvite(null), Math.max(0, invite.expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [invite])

  const run = async (action: () => Promise<MobileRelayStatus>): Promise<void> => {
    setBusy(true); setError('')
    try { setStatus(await action()) } catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  return <div className="settings-section">
    <SectionHeader title="Mobile access" description="Connect this computer to your relay and pair your phone." />
    <div className="space-y-3">
      <SettingsCard>
        <div className="space-y-2 px-4 py-3 text-sm text-fgdim">
          <p className="font-medium text-fg">How to connect</p>
          <ol className="list-inside list-decimal space-y-1">
            <li>Set your relay URL and turn on Remote access. Keep Superior running on this computer.</li>
            <li>Wait until the connection says Connected, then generate a pairing QR code.</li>
            <li>Scan the QR code in the future Superior mobile app. It stores the pairing secret on your phone.</li>
          </ol>
          <p className="text-xs">The mobile app is not available yet. This screen is ready for its pairing flow.</p>
        </div>
      </SettingsCard>
      <SettingsCard>
        <SettingRow title="Relay URL" description="Public wss:// address. A local override takes precedence over the release build URL.">
          <div className="flex items-center gap-2">
            <input aria-label="Relay URL" className="w-72 max-w-full rounded-md border border-edge bg-bar px-2 py-1 text-sm text-fg" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="wss://relay.example.com" />
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(() => window.api.setMobileRelayUrl(url.trim()))}>Save</Button>
          </div>
        </SettingRow>
        <SettingRow title="Remote access" description="Disabled until you turn it on. Terminals remain on this computer.">
          <Toggle checked={status?.enabled === true} onChange={(enabled) => void run(() => window.api.setMobileRelayEnabled(enabled))} label="Remote access" />
        </SettingRow>
        <SettingRow title="Connection" description={status?.error || 'The desktop must stay open for remote access.'}>
          <span className="text-sm text-fgdim">{status?.connected ? 'Connected' : status?.enabled ? 'Disconnected' : 'Off'}</span>
        </SettingRow>
      </SettingsCard>
      <SettingsCard>
        <SettingRow title="Pair a device" description="The QR code contains a secret. Show it only to your own phone; it expires in five minutes.">
          <Button size="sm" variant="secondary" disabled={!status?.connected || busy} onClick={() => {
            setBusy(true); setError('')
            void window.api.createMobileRelayInvite().then(setInvite).catch((err) => setError((err as Error).message)).finally(() => setBusy(false))
          }}>Generate pairing QR code</Button>
        </SettingRow>
        {invite && <div className="space-y-3 px-4 pb-4">
          <div className="flex justify-center">
            <div className="rounded-lg bg-white p-2">
              <QRCodeSVG value={invite.pairing} size={256} level="M" marginSize={4} title="Mobile pairing QR code" />
            </div>
          </div>
          <p className="text-center text-xs text-fgdim">Expires at {new Date(invite.expiresAt).toLocaleTimeString()}.</p>
          <details className="text-xs text-fgdim">
            <summary className="cursor-pointer">Show pairing data for manual transfer</summary>
            <textarea readOnly aria-label="Pairing data" className="mt-2 h-24 w-full rounded-md border border-edge bg-bar p-2 font-mono text-xs text-fg" value={invite.pairing} onFocus={(e) => e.currentTarget.select()} />
          </details>
        </div>}
        {status?.devices.map((device) => <SettingRow key={device.id} title={device.id} description={device.paired ? 'Paired' : 'Waiting for pairing'}>
          <Button size="sm" variant="ghost" disabled={busy || !status.connected} onClick={() => void run(() => window.api.revokeMobileRelayDevice(device.id))}>Revoke</Button>
        </SettingRow>)}
      </SettingsCard>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  </div>
}
