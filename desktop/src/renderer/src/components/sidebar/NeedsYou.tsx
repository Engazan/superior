import type { CSSProperties } from 'react'
import { useAgentSessionStates, useAttentionSessions } from '../../activityStore'
import { useI18n } from '../../i18n'
import { PresetIcon } from '../PresetIcon'
import { needsYouItems } from '../../needsYou'
import type { AgentSession, Workspace } from '../../types'

interface Props {
  sessions: AgentSession[]
  workspaces: Workspace[]
  attentionColor: string
  onSelectSession: (session: AgentSession) => void
}

/**
 * Queue of terminals that wait for the user, pinned above the workspace list so
 * an agent that asks for approval never hides in a background tab. Renders
 * nothing while no terminal needs attention.
 */
export function NeedsYou({ sessions, workspaces, attentionColor, onSelectSession }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const attention = useAttentionSessions()
  const agentStates = useAgentSessionStates()
  const items = needsYouItems(sessions, attention, agentStates)
  if (items.length === 0) return null
  const workspaceName = (id: string): string => workspaces.find((w) => w.id === id)?.name ?? ''

  return (
    <section
      aria-label={t('sidebar.needsYou')}
      className="superior-needs-you mx-3 mt-3 flex flex-col gap-1.5"
      style={{ '--attn': attentionColor } as CSSProperties}
    >
      <div className="flex h-6 items-center gap-2 px-1.5">
        <span className="superior-needs-you-label flex-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
          {t('sidebar.needsYou')} · {items.length}
        </span>
        <span aria-hidden className="attention-pulse-dot h-2 w-2 rounded-full" />
      </div>
      <ul className="flex flex-col gap-1">
        {items.map(({ session, reason }) => {
          const label = session.label
          const workspace = workspaceName(session.workspaceId)
          const detail =
            reason === 'waiting'
              ? t('sidebar.needsYouWaiting')
              : reason === 'exited'
                ? t('terminal.exitedChip', { code: String(session.exitCode ?? '?') })
                : t('sidebar.needsYouAlert')
          return (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onSelectSession(session)}
                aria-label={t('sidebar.needsYouOpen', { label, workspace })}
                className="superior-needs-you-card flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-panel" aria-hidden>
                  <PresetIcon iconType={session.iconType} icon={session.icon} className="size-4 text-sm" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-semibold text-fg">
                    {label}
                    {workspace && <span className="font-normal text-fgmuted"> · {workspace}</span>}
                  </span>
                  <span className="superior-needs-you-detail truncate text-[11px]">{detail}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
