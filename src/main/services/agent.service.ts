import { randomUUID } from 'crypto'
import { type AgentSession, type StartAgentArgs, type StartAgentResult } from '@shared/types'
import { daemonClient } from './daemonClient'
import { isValidWorkspaceDir } from './workspace.service'

/**
 * Validate, then ask the daemon to spawn a preset's command. The daemon owns the
 * pty and streams output/exit back to the renderer via daemonClient's relay.
 */
export async function startAgent(args: StartAgentArgs): Promise<StartAgentResult> {
  const { command, label, cwd, workspaceId } = args

  if (!cwd) {
    return { error: 'No workspace selected. Open a folder first.' }
  }
  if (!isValidWorkspaceDir(cwd)) {
    return { error: 'Workspace folder is invalid or no longer exists.' }
  }
  // An empty command is allowed: the daemon launches a plain interactive shell.

  const id = randomUUID()
  const createdAt = Date.now()
  const cols = args.cols ?? 80
  const rows = args.rows ?? 24

  try {
    const { pid } = await daemonClient.spawn({
      id,
      command,
      cwd,
      cols,
      rows,
      meta: { label, iconType: args.iconType, icon: args.icon, command, workspaceId, createdAt }
    })

    const session: AgentSession = {
      id,
      label,
      command,
      iconType: args.iconType,
      icon: args.icon,
      workspaceId,
      status: 'running',
      pid,
      cols,
      rows,
      createdAt
    }
    return { session }
  } catch (err) {
    const what = command.trim().split(/\s+/)[0] || label || 'terminal'
    return { error: `Failed to start ${what}: ${(err as Error).message}` }
  }
}

/** Rebuild the AgentSession list from the daemon's surviving sessions. */
export async function restoreSessions(): Promise<AgentSession[]> {
  const list = await daemonClient.list()
  return list.map((s) => ({
    id: s.id,
    label: s.meta.label,
    command: s.meta.command,
    iconType: s.meta.iconType,
    icon: s.meta.icon,
    workspaceId: s.meta.workspaceId,
    status: s.status,
    pid: s.pid,
    cols: s.cols,
    rows: s.rows,
    createdAt: s.meta.createdAt
  }))
}

export function killAgent(id: string): void {
  daemonClient.kill(id)
}
