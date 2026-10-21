import { useCallback, useEffect, useState } from 'react'
import { builtinIcon } from '@shared/icons'
import { useI18n } from '../i18n'
import { Button, Notice, StatusPill, SectionHeader, RefreshIcon } from './ui'
import type { CliToolId, CliToolStatus } from '../types'

/**
 * A small health panel in the preset settings showing whether the CLIs the
 * built-in presets launch (claude, codex) are installed and — crucially —
 * resolvable in the login shell this app spawns. When a CLI is installed but
 * invisible to that shell, a one-click fix adds it to the shell's env file.
 */
export function CliToolsHealth(): React.JSX.Element {
  const { t } = useI18n()
  const [tools, setTools] = useState<CliToolStatus[] | null>(null)
  const [busyId, setBusyId] = useState<CliToolId | null>(null)
  // tone distinguishes a failure from a success note — muted gray for both
  // made errors invisible.
  const [note, setNote] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null)

  const refresh = useCallback(async (force = false) => {
    setTools(await window.api.checkCliTools(force))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A forced re-check probes the login shell again and can take a moment.
  const [rechecking, setRechecking] = useState(false)
  const recheck = async (): Promise<void> => {
    setRechecking(true)
    try {
      await refresh(true)
    } finally {
      setRechecking(false)
    }
  }

  const fix = async (id: CliToolId): Promise<void> => {
    setBusyId(id)
    setNote(null)
    try {
      const result = await window.api.fixCliTool(id)
      setTools((prev) => (prev ? prev.map((tnow) => (tnow.id === id ? result.status : tnow)) : prev))
      if (result.fixedFile && result.status.availableInShell) {
        setNote({ text: t('cli.fixed', { file: result.fixedFile }), tone: 'success' })
      } else {
        setNote({ text: t('cli.fixFailed'), tone: 'danger' })
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="settings-subsection">
      <SectionHeader level={3} title={t('cli.title')} description={t('cli.description')}
        actions={<Button variant="secondary" size="sm" loading={rechecking} onClick={() => void recheck()}>{!rechecking && <RefreshIcon />}{t('cli.recheck')}</Button>}
      />

      <div className="settings-island">
        {tools === null ? (
          <p role="status" className="px-4 py-4 text-sm text-fgmuted">{t('cli.checking')}</p>
        ) : (
          <ul>
            {tools.map((tool) => {
              const icon = builtinIcon(tool.id)
              return (
                <li
                  key={tool.id}
                  className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-3 text-sm transition last:border-b-0 hover:bg-hover"
                >
                  {icon && <img src={icon.dataUrl} alt="" className="h-5 w-5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-fg">{tool.label}</div>
                    {tool.installedPath && (
                      <div className="truncate font-mono text-[11px] text-fgmuted" title={tool.installedPath}>
                        {tool.installedPath}
                      </div>
                    )}
                  </div>

                  {tool.availableInShell ? (
                    <StatusPill tone="success" dot>
                      {t('cli.available')}
                    </StatusPill>
                  ) : tool.installed ? (
                    <>
                      <StatusPill tone="warn" dot>
                        {t('cli.notOnPath')}
                      </StatusPill>
                      {tool.fixable && (
                        <Button
                          size="sm"
                          loading={busyId === tool.id}
                          onClick={() => void fix(tool.id)}
                        >
                          {busyId === tool.id ? t('cli.fixing') : t('cli.fix')}
                        </Button>
                      )}
                    </>
                  ) : (
                    <StatusPill tone="danger" dot>
                      {t('cli.notFound')}
                    </StatusPill>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {note && (
        <Notice tone={note.tone} className="mt-3">
          {note.text}
        </Notice>
      )}
    </section>
  )
}
