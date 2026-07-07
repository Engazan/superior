import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { Button, SectionHeader, SettingRow, SettingsCard, StatusPill } from './ui'
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
  // tone distinguishes a failure from a success note — muted gray for both
  // made errors invisible.
  const [note, setNote] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null)

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
        setNote({ text: t('shell.installFailed', { message: result.error ?? '' }), tone: 'danger' })
      } else if (result.resolvable) {
        setNote({ text: t('shell.installed'), tone: 'success' })
      } else {
        setNote({
          text: t('shell.installedReopen', { file: result.pathNote ?? 'PATH' }),
          tone: 'success'
        })
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const installed = status?.resolvable === true

  return (
    <div className="max-w-2xl">
      <SectionHeader title={t('settings.shellCommand')} description={t('shell.description')} />

      <SettingsCard>
        <SettingRow title={t('shell.title')} description={t('shell.example')}>
          <code className="rounded-md border border-edge bg-bar px-2 py-1 font-mono text-sm text-fg">
            superior .
          </code>
        </SettingRow>

        <SettingRow
          title={t('shell.status')}
          description={status?.path ?? undefined}
        >
          {installed ? (
            <StatusPill tone="success" dot>
              {t('shell.available')}
            </StatusPill>
          ) : status?.installed ? (
            <StatusPill tone="warn" dot>
              {t('shell.notOnPath')}
            </StatusPill>
          ) : (
            <StatusPill tone="danger" dot>
              {t('shell.notInstalled')}
            </StatusPill>
          )}
          <Button size="sm" loading={busy} onClick={() => void install()}>
            {busy ? t('shell.installing') : installed ? t('shell.reinstall') : t('shell.install')}
          </Button>
        </SettingRow>
      </SettingsCard>

      {note && (
        <p
          role="status"
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            note.tone === 'danger'
              ? 'border-dangerBorder bg-dangerBg text-danger'
              : 'border-statusBorder bg-statusBg text-status'
          }`}
        >
          {note.text}
        </p>
      )}
    </div>
  )
}
