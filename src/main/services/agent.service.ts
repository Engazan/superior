import { randomUUID } from 'crypto'
import * as os from 'os'
import {
  type AgentLaunchTarget,
  type AgentSession,
  type AgentStatus,
  type StartAgentArgs,
  type StartAgentResult
} from '@shared/types'
import type { DaemonSession, DirectSpawn } from '@shared/daemon-protocol'
import { daemonClient } from './daemonClient'
import { isValidWorkspaceDir } from './workspace.service'
import { startUsageTracking, stopAllUsageTracking } from './usage.service'
import { ensureClaudeStatusline, restoreAllClaudeStatuslines } from './statusline.service'
import { getSettings } from './settings.service'
import {
  listPersistedSessions,
  patchPersistedSession,
  reconcilePersistedSessions,
  removePersistedSession,
  upsertPersistedSession
} from './session-store.service'

function hasControlChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value)
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function cmdQuote(value: string): string {
  return `"${value.replace(/(["^&|<>%])/g, '^$1')}"`
}

function localShellQuote(value: string): string {
  return process.platform === 'win32' ? cmdQuote(value) : shellQuote(value)
}

function cleanLaunchTarget(args: StartAgentArgs): AgentLaunchTarget | { error: string } {
  const target = args.launchTarget ?? { kind: 'local' as const, cwd: args.cwd }
  if (target.kind === 'local') {
    if (!target.cwd) return { error: 'No workspace selected. Open a folder first.' }
    if (!isValidWorkspaceDir(target.cwd)) {
      return { error: 'Workspace folder is invalid or no longer exists.' }
    }
    return target
  }

  const host = target.host.trim()
  const remotePath = target.path.trim()
  if (!host) return { error: 'Remote SSH host is empty.' }
  if (!remotePath) return { error: 'Remote workspace path is empty.' }
  if (host.startsWith('-') || /\s/.test(host) || hasControlChars(host)) {
    return { error: 'Remote SSH host must be an alias or user@host without spaces.' }
  }
  if (hasControlChars(remotePath)) {
    return { error: 'Remote workspace path cannot contain control characters.' }
  }
  return { kind: 'remote', host, path: remotePath }
}

function remotePathScript(remotePath: string): string {
  return [
    `dir=${shellQuote(remotePath)};`,
    `case "$dir" in`,
    `  '~') dir="$HOME" ;;`,
    `  '~/'*) dir="$HOME/\${dir#\\~/}" ;;`,
    `esac;`,
    `cd -- "$dir" || exit 72;`
  ].join(' ')
}

function remoteCommandScript(remotePath: string, command: string): string {
  const prefix = remotePathScript(remotePath)
  if (command.trim()) {
    return [
      prefix,
      `if [ -n "\${SHELL:-}" ]; then`,
      `  exec "$SHELL" -l -c ${shellQuote(command)};`,
      `else`,
      `  exec /bin/sh -c ${shellQuote(command)};`,
      `fi`
    ].join(' ')
  }
  return [
    prefix,
    `if [ -n "\${SHELL:-}" ]; then`,
    `  exec "$SHELL" -l -i;`,
    `else`,
    `  exec /bin/sh;`,
    `fi`
  ].join(' ')
}

function remoteDisplayCwd(target: Extract<AgentLaunchTarget, { kind: 'remote' }>): string {
  return `${target.host}:${target.path}`
}

function remoteSshCommand(target: Extract<AgentLaunchTarget, { kind: 'remote' }>, command: string): string {
  return [
    'ssh',
    '-tt',
    localShellQuote(target.host),
    localShellQuote(remoteCommandScript(target.path, command))
  ].join(' ')
}

function sessionFromDaemon(s: Awaited<ReturnType<typeof daemonClient.list>>[number]): AgentSession {
  return {
    id: s.id,
    label: s.meta.label,
    nickname: s.meta.nickname,
    command: s.meta.command,
    launchTarget: s.meta.launchTarget,
    iconType: s.meta.iconType,
    icon: s.meta.icon,
    color: s.meta.color,
    workspaceId: s.meta.workspaceId,
    // Absent on sessions from an older build; the renderer reassigns these to the workspace's active tab.
    tabId: s.meta.tabId ?? '',
    status: s.status,
    pid: s.pid,
    cols: s.cols,
    rows: s.rows,
    createdAt: s.meta.createdAt
  }
}

/**
 * Validate, then ask the daemon to spawn a preset's command. The daemon owns the
 * pty and streams output/exit back to the renderer via daemonClient's relay.
 */
export async function startAgent(args: StartAgentArgs): Promise<StartAgentResult> {
  const { command, label, workspaceId, tabId } = args
  // Blank nicknames are stored as absent so the label shows alone.
  const nickname = args.nickname?.trim() || undefined

  const launchTarget = cleanLaunchTarget(args)
  if ('error' in launchTarget) return launchTarget
  // An empty command is allowed: the daemon launches a plain interactive shell.

  const id = randomUUID()
  const createdAt = Date.now()
  const cols = args.cols ?? 80
  const rows = args.rows ?? 24
  const remote = launchTarget.kind === 'remote' ? launchTarget : null
  const local = launchTarget.kind === 'local' ? launchTarget : null
  const spawnCwd = remote ? os.homedir() : local?.cwd
  if (!spawnCwd) return { error: 'No workspace selected. Open a folder first.' }
  const sessionCwd = remote ? remoteDisplayCwd(remote) : spawnCwd
  const direct: DirectSpawn | undefined = remote
    ? {
        executable: 'ssh',
        args: ['-tt', remote.host, remoteCommandScript(remote.path, command)]
      }
    : undefined
  // If an older daemon without direct-spawn support is still alive after an app
  // update, this command still runs through ssh instead of running the preset
  // locally. Current daemons use `direct` above and treat this as metadata/log text.
  const daemonCommand = remote ? remoteSshCommand(remote, command) : command

  // Only when the user has opted in: install the status-line wrapper before launch
  // so this very session reports its rate-limit usage (Claude reads settings.json
  // at startup). No-op for non-Claude. Off by default → Claude config is untouched.
  const usageEnabled = getSettings().usageTracking
  if (usageEnabled && !remote) ensureClaudeStatusline(command)

  // A bad command can die before the spawn reply is processed — the daemon may
  // deliver `spawned` and `exit` in one socket chunk, so the exit fans out
  // before this async continuation runs and nothing matches it yet. Capture it
  // and return the session in its real final state instead of a phantom
  // 'running' that no later exit event will ever correct.
  const earlyExit: { exitCode: number | null } = { exitCode: null }
  const offEarlyExit = daemonClient.onExit((e) => {
    if (e.id === id) earlyExit.exitCode = e.exitCode
  })
  try {
    const { pid } = await daemonClient.spawn({
      id,
      command: daemonCommand,
      direct,
      cwd: spawnCwd,
      cols,
      rows,
      meta: {
        label,
        nickname,
        iconType: args.iconType,
        icon: args.icon,
        color: args.color,
        command,
        cwd: sessionCwd,
        launchTarget,
        workspaceId,
        tabId,
        createdAt
      }
    })

    const exited = earlyExit.exitCode

    // Surface live token/cost usage when this command runs a Claude CLI (no-op
    // otherwise). Skipped for an already-dead session: its stop already fired.
    if (usageEnabled && local && exited === null) {
      startUsageTracking({ id, cwd: local.cwd, command, createdAt })
    }

    const session: AgentSession = {
      id,
      label,
      nickname,
      command,
      launchTarget,
      iconType: args.iconType,
      icon: args.icon,
      color: args.color,
      workspaceId,
      tabId,
      status: exited === null ? 'running' : exitStatus(exited),
      pid: exited === null ? pid : undefined,
      exitCode: exited ?? undefined,
      cols,
      rows,
      createdAt
    }
    upsertPersistedSession(session)
    return { session }
  } catch (err) {
    const what = command.trim().split(/\s+/)[0] || label || 'terminal'
    return { error: `Failed to start ${what}: ${(err as Error).message}` }
  } finally {
    offEarlyExit()
  }
}

/** Rebuild the UI session list from live daemon PTYs plus restartable snapshots. */
export async function restoreSessions(): Promise<AgentSession[]> {
  let list: DaemonSession[]
  try {
    list = await daemonClient.list()
  } catch {
    // No answer is not the same as no sessions: reconciling against [] would
    // downgrade every running session to a restartable cell, and "restarting"
    // one spawns a duplicate next to the still-live pty. Report the last
    // persisted state instead.
    return listPersistedSessions()
  }
  const live = list.map(sessionFromDaemon)
  // Resume usage tracking for any Claude session that outlived the app (cwd is
  // absent on sessions spawned by an older build — those simply aren't tracked).
  if (getSettings().usageTracking) {
    for (const s of list) {
      if (s.meta.cwd && s.meta.launchTarget?.kind !== 'remote') {
        startUsageTracking({
          id: s.id,
          cwd: s.meta.cwd,
          command: s.meta.command,
          createdAt: s.meta.createdAt
        })
      }
    }
  }
  return reconcilePersistedSessions(live)
}

export function killAgent(id: string): void {
  removePersistedSession(id)
  daemonClient.kill(id)
}

/** Persist a session's nickname in the daemon so it survives an app restart. */
export function updateSessionNickname(id: string, nickname: string): void {
  patchPersistedSession(id, { nickname: nickname.trim() || undefined })
  daemonClient.updateMeta(id, { nickname })
}

/** Persist the latest terminal size and forward it to the live daemon session. */
export function resizeAgent(id: string, cols: number, rows: number): void {
  patchPersistedSession(id, { cols, rows })
  daemonClient.resize(id, cols, rows)
}

/** UI status for an exit code: user-interrupt/TERM codes read as a clean exit. */
function exitStatus(exitCode: number): AgentStatus {
  return exitCode === 0 || exitCode === 130 || exitCode === 143 ? 'exited' : 'error'
}

daemonClient.onExit(({ id, exitCode }) => {
  patchPersistedSession(id, {
    status: exitStatus(exitCode),
    exitCode,
    pid: undefined
  })
})

/**
 * React to the usage-tracking toggle without needing an app restart. When turned
 * off, drop every tracker (badges clear) and restore every Claude statusLine we
 * took over, so disabling fully reverses the install. When turned on, install the
 * status-line wrapper for and begin tracking each already-running Claude session —
 * transcript cost/tokens appear at once; rate limits follow on the session's next
 * launch, since Claude only reads settings.json at startup.
 */
export async function syncUsageTracking(enabled: boolean): Promise<void> {
  if (!enabled) {
    stopAllUsageTracking()
    restoreAllClaudeStatuslines()
    return
  }
  // An unreachable daemon just means nothing to track right now.
  const list = await daemonClient.list().catch(() => [] as DaemonSession[])
  for (const s of list) {
    if (!s.meta.cwd || s.meta.launchTarget?.kind === 'remote') continue
    ensureClaudeStatusline(s.meta.command)
    startUsageTracking({
      id: s.id,
      cwd: s.meta.cwd,
      command: s.meta.command,
      createdAt: s.meta.createdAt
    })
  }
}
