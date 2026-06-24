import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { ShellCommandStatus } from '../types'

/**
 * Installs the `superior` shell command so users can open a folder in the app
 * from a terminal (`superior .`). Mirrors VS Code's "install 'code' command":
 * one click writes a launcher and ensures its directory is on PATH.
 */
export function ShellCommandSection(): JSX.Element {
  const { t } = useI18n()
  const [status, setStatus] = useState<ShellCommandStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setStatus(await window.api.getShellCommandStatus())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const install = async (): Promise<void> => {
    setBusy(true)
    setNote(null)
    try {
      const result = await window.api.installShellCommand()
      if (!result.ok) {
        setNote(t('shell.installFailed', { message: result.error ?? '' }))
      } else if (result.resolvable) {
        setNote(t('shell.installed'))
      } else {
        setNote(t('shell.installedReopen', { file: result.pathNote ?? 'PATH' }))
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const installed = status?.resolvable === true

  return (
    <>
      <h2 className="mb-6 text-lg font-semibold text-fg">{t('settings.shellCommand')}</h2>

      <section className="max-w-xl">
        <div className="mb-1.5 text-sm font-medium text-fg">{t('shell.title')}</div>
        <p className="mb-3 text-xs text-fgdim">{t('shell.description')}</p>

        <div className="mb-4 rounded-lg border border-edge bg-bar px-3 py-2.5">
          <div className="font-mono text-sm text-fg">superior .</div>
          <p className="mt-1 text-[11px] text-fgmuted">{t('shell.example')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void install()}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t('shell.installing') : installed ? t('shell.reinstall') : t('shell.install')}
          </button>
          {installed ? (
            <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
              {t('shell.available')}
            </span>
          ) : status?.installed ? (
            <span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400">
              {t('shell.notOnPath')}
            </span>
          ) : (
            <span className="rounded-md bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-400">
              {t('shell.notInstalled')}
            </span>
          )}
        </div>

        {status?.path && (
          <div className="mt-3 truncate font-mono text-[11px] text-fgmuted" title={status.path}>
            {status.path}
          </div>
        )}
        {note && <p className="mt-3 text-xs text-fgdim">{note}</p>}
      </section>
    </>
  )
}
