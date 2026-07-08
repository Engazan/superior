import { useCallback, useEffect, useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import { Button, EmptyState, SectionHeader, useConfirm, useToast } from './ui'
import type { AgentSession, Folder, Workspace } from '../types'

interface Props {
  workspaces: Workspace[]
  folders: Folder[]
  onKill: (id: string) => void
}

/** Lists the live PTY sessions owned by the background daemon, with kill controls. */
export function DaemonsSection({ workspaces, folders, onKill }: Props): JSX.Element {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const [list, setList] = useState<AgentSession[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const sessions = await window.api.restoreSessions()
    setList(sessions.filter((s) => s.status === 'running'))
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

  // Killing terminates a live process — always confirm first.
  const kill = async (s: AgentSession): Promise<void> => {
    const ok = await confirm({
      title: t('confirm.daemonKillTitle'),
      message: t('confirm.daemonKillMessage', { label: s.label }),
      confirmLabel: t('daemons.kill'),
      tone: 'danger'
    })
    if (!ok) return
    onKill(s.id)
    setList((prev) => prev.filter((x) => x.id !== s.id))
    toast.success(t('toast.daemonKilled', { label: s.label }))
  }
  const killAll = async (): Promise<void> => {
    const n = list.length
    const ok = await confirm({
      title: t('confirm.daemonKillAllTitle'),
      message: t('confirm.daemonKillAllMessage', { n }),
      confirmLabel: t('daemons.killAll'),
      tone: 'danger'
    })
    if (!ok) return
    list.forEach((s) => onKill(s.id))
    setList([])
    toast.success(t('toast.daemonsKilled', { n }))
  }

  return (
    <>
      <SectionHeader
        title={t('settings.daemons')}
        description={t('daemons.desc')}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={refresh}>
              {t('daemons.refresh')}
            </Button>
            {list.length > 0 && (
              <Button variant="danger" size="sm" onClick={() => void killAll()}>
                {t('daemons.killAll')}
              </Button>
            )}
          </>
        }
      />

      {list.length === 0 ? (
        <EmptyState title={loading ? t('daemons.loading') : t('daemons.empty')} />
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
                  <span className="h-2 w-2 shrink-0 rounded-full bg-status" />
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
                    onClick={() => void kill(s)}
                    className="rounded-md px-2 py-0.5 text-xs text-danger transition hover:bg-dangerBg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50"
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
