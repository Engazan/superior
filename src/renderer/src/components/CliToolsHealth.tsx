import { useCallback, useEffect, useState } from 'react'
import { builtinIcon } from '@shared/icons'
import { useI18n } from '../i18n'
import { Button, StatusPill } from './ui'
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
    <div className="mt-8">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-base font-semibold text-fg">{t('cli.title')}</h3>
        <Button variant="ghost" size="sm" onClick={() => void refresh(true)}>
          {t('cli.recheck')}
        </Button>
      </div>
      <p className="mb-3 max-w-xl text-xs text-fgdim">{t('cli.description')}</p>

      <div className="overflow-hidden rounded-lg border border-edge">
        {tools === null ? (
          <div className="px-3 py-4 text-sm text-fgmuted">{t('cli.checking')}</div>
        ) : (
          <ul>
            {tools.map((tool) => {
              const icon = builtinIcon(tool.id)
              return (
                <li
                  key={tool.id}
                  className="flex items-center gap-3 border-b border-edge px-3 py-2.5 text-sm last:border-b-0"
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
        <p
          role="status"
          className={`mt-2 rounded-md border px-3 py-2 text-xs ${
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
