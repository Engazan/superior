import { randomUUID } from 'crypto'
import { type AgentSession, type StartAgentArgs, type StartAgentResult } from '@shared/types'
import { daemonClient } from './daemonClient'
import { isValidWorkspaceDir } from './workspace.service'
import { startUsageTracking, stopAllUsageTracking } from './usage.service'
import { ensureClaudeStatusline } from './statusline.service'
import { getSettings } from './settings.service'

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

  // Only when the user has opted in: install the status-line wrapper before launch
  // so this very session reports its rate-limit usage (Claude reads settings.json
  // at startup). No-op for non-Claude. Off by default → Claude config is untouched.
  const usageEnabled = getSettings().usageTracking
  if (usageEnabled) ensureClaudeStatusline(command)

  try {
    const { pid } = await daemonClient.spawn({
      id,
      command,
      cwd,
      cols,
      rows,
      meta: {
        label,
        iconType: args.iconType,
        icon: args.icon,
        color: args.color,
        command,
        cwd,
        workspaceId,
        createdAt
      }
    })

    // Surface live token/cost usage when this command runs a Claude CLI (no-op otherwise).
    if (usageEnabled) startUsageTracking({ id, cwd, command, createdAt })

    const session: AgentSession = {
      id,
      label,
      command,
      iconType: args.iconType,
      icon: args.icon,
      color: args.color,
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
  // Resume usage tracking for any Claude session that outlived the app (cwd is
  // absent on sessions spawned by an older build — those simply aren't tracked).
  if (getSettings().usageTracking) {
    for (const s of list) {
      if (s.meta.cwd) {
        startUsageTracking({
          id: s.id,
          cwd: s.meta.cwd,
          command: s.meta.command,
          createdAt: s.meta.createdAt
        })
      }
    }
  }
  return list.map((s) => ({
    id: s.id,
    label: s.meta.label,
    command: s.meta.command,
    iconType: s.meta.iconType,
    icon: s.meta.icon,
    color: s.meta.color,
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

/**
 * React to the usage-tracking toggle without needing an app restart. When turned
 * off, drop every tracker (badges clear). When turned on, install the status-line
 * wrapper for and begin tracking each already-running Claude session — transcript
 * cost/tokens appear at once; rate limits follow on the session's next launch,
 * since Claude only reads settings.json at startup.
 */
export async function syncUsageTracking(enabled: boolean): Promise<void> {
  if (!enabled) {
    stopAllUsageTracking()
    return
  }
  const list = await daemonClient.list()
  for (const s of list) {
    if (!s.meta.cwd) continue
    ensureClaudeStatusline(s.meta.command)
    startUsageTracking({
      id: s.id,
      cwd: s.meta.cwd,
      command: s.meta.command,
      createdAt: s.meta.createdAt
    })
  }
}
