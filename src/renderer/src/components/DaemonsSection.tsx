import { useCallback, useEffect, useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import type { AgentSession, Folder, Workspace } from '../types'

interface Props {
  workspaces: Workspace[]
  folders: Folder[]
  onKill: (id: string) => void
}

/** Lists the live PTY sessions owned by the background daemon, with kill controls. */
export function DaemonsSection({ workspaces, folders, onKill }: Props): JSX.Element {
  const { t } = useI18n()
  const [list, setList] = useState<AgentSession[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const sessions = await window.api.restoreSessions()
    setList(sessions)
    setLoading(false)
  }, [])

  // Poll so the list stays current as sessions start/exit elsewhere.
  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 2500)
    return () => window.clearInterval(id)
  }, [refresh])

  const workspaceLabel = (workspaceId: string): string => {
    const ws = workspaces.find((w) => w.id === workspaceId)
    if (!ws) return t('daemons.orphan')
    const folder = folders.find((f) => f.path === ws.folderPath)
    return folder ? `${folder.name} / ${ws.name}` : ws.name
  }

  const kill = (id: string): void => {
    onKill(id)
    setList((prev) => prev.filter((s) => s.id !== id))
  }
  const killAll = (): void => {
    list.forEach((s) => onKill(s.id))
    setList([])
  }

  return (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-fg">{t('settings.daemons')}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="rounded-md border border-edge px-2.5 py-1 text-xs text-fgdim transition hover:bg-hover hover:text-fg"
          >
            {t('daemons.refresh')}
          </button>
          {list.length > 0 && (
            <button
              onClick={killAll}
              className="rounded-md border border-red-900/60 px-2.5 py-1 text-xs text-red-300 transition hover:bg-red-950/40 hover:text-red-200"
            >
              {t('daemons.killAll')}
            </button>
          )}
        </div>
      </div>
      <p className="mb-4 max-w-xl text-xs text-fgdim">{t('daemons.desc')}</p>

      {list.length === 0 ? (
        <p className="rounded-lg border border-edge bg-bar px-4 py-6 text-center text-sm text-fgmuted">
          {loading ? '…' : t('daemons.empty')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge">
          <div className="flex items-center gap-3 border-b border-edge bg-bar px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-fgmuted">
            <span className="min-w-0 flex-1">{t('daemons.colCommand')}</span>
            <span className="w-44 shrink-0">{t('daemons.colWorkspace')}</span>
            <span className="w-16 shrink-0 text-right">{t('daemons.colPid')}</span>
            <span className="w-16 shrink-0" />
          </div>
          <ul>
            {list.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 border-b border-edge px-3 py-2 text-sm last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                  <PresetIcon iconType={s.iconType} icon={s.icon} className="h-4 w-4 text-base" />
                  <span className="min-w-0">
                    <span className="block truncate text-fg">{s.label}</span>
                    <span className="block truncate font-mono text-[10px] text-fgmuted">
                      {s.command}
                    </span>
                  </span>
                </span>
                <span className="w-44 shrink-0 truncate text-xs text-fgdim">
                  {workspaceLabel(s.workspaceId)}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-xs text-fgdim">
                  {s.pid ?? '—'}
                </span>
                <span className="w-16 shrink-0 text-right">
                  <button
                    onClick={() => kill(s.id)}
                    className="rounded-md px-2 py-0.5 text-xs text-red-300 transition hover:bg-red-950/40 hover:text-red-200"
                  >
                    {t('daemons.kill')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
