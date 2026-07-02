import { useCallback, useEffect, useState } from 'react'
import { builtinIcon } from '@shared/icons'
import { useI18n } from '../i18n'
import type { CliToolId, CliToolStatus } from '../types'

/**
 * A small health panel in the preset settings showing whether the CLIs the
 * built-in presets launch (claude, codex) are installed and — crucially —
 * resolvable in the login shell this app spawns. When a CLI is installed but
 * invisible to that shell, a one-click fix adds it to the shell's env file.
 */
export function CliToolsHealth(): JSX.Element {
  const { t } = useI18n()
  const [tools, setTools] = useState<CliToolStatus[] | null>(null)
  const [busyId, setBusyId] = useState<CliToolId | null>(null)
  const [note, setNote] = useState<string | null>(null)

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
        setNote(t('cli.fixed', { file: result.fixedFile }))
      } else {
        setNote(t('cli.fixFailed'))
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-base font-semibold text-fg">{t('cli.title')}</h3>
        <button
          onClick={() => void refresh(true)}
          className="rounded-md px-2 py-1 text-xs text-fgdim transition hover:bg-hover hover:text-fg"
        >
          {t('cli.recheck')}
        </button>
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
                    <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                      {t('cli.available')}
                    </span>
                  ) : tool.installed ? (
                    <>
                      <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400">
                        {t('cli.notOnPath')}
                      </span>
                      {tool.fixable && (
                        <button
                          onClick={() => void fix(tool.id)}
                          disabled={busyId === tool.id}
                          className="shrink-0 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
                        >
                          {busyId === tool.id ? t('cli.fixing') : t('cli.fix')}
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="shrink-0 rounded-md bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-400">
                      {t('cli.notFound')}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {note && <p className="mt-2 text-xs text-fgdim">{note}</p>}
    </div>
  )
}
