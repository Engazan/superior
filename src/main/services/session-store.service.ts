import type { AgentLaunchTarget, AgentSession, AgentStatus } from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

function storeFile(): string {
  return userDataFile('terminal-sessions.json')
}

function isStatus(value: unknown): value is AgentStatus {
  return value === 'running' || value === 'exited' || value === 'error'
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeLaunchTarget(value: unknown): AgentLaunchTarget | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  if (raw.kind === 'local' && typeof raw.cwd === 'string') {
    return { kind: 'local', cwd: raw.cwd }
  }
  if (raw.kind === 'remote' && typeof raw.host === 'string' && typeof raw.path === 'string') {
    return { kind: 'remote', host: raw.host, path: raw.path }
  }
  return undefined
}

function normalize(value: unknown): AgentSession | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (
    typeof raw.id !== 'string' ||
    typeof raw.label !== 'string' ||
    typeof raw.command !== 'string' ||
    typeof raw.workspaceId !== 'string' ||
    !isStatus(raw.status)
  ) {
    return null
  }

  return {
    id: raw.id,
    label: raw.label,
    nickname: optionalString(raw.nickname),
    command: raw.command,
    launchTarget: normalizeLaunchTarget(raw.launchTarget),
    iconType: raw.iconType === 'emoji' || raw.iconType === 'image' ? raw.iconType : undefined,
    icon: optionalString(raw.icon),
    color: optionalString(raw.color),
    workspaceId: raw.workspaceId,
    tabId: typeof raw.tabId === 'string' ? raw.tabId : '',
    status: raw.status,
    pid: optionalNumber(raw.pid),
    exitCode:
      typeof raw.exitCode === 'number' && Number.isFinite(raw.exitCode)
        ? raw.exitCode
        : raw.exitCode === null
          ? null
          : undefined,
    error: optionalString(raw.error),
    cols: optionalNumber(raw.cols),
    rows: optionalNumber(raw.rows),
    createdAt: optionalNumber(raw.createdAt) ?? Date.now()
  }
}

function readSessions(): AgentSession[] {
  const raw = readJsonFile<unknown[]>(storeFile(), [], (parsed) =>
    Array.isArray(parsed) ? parsed : null
  )
  return raw.map(normalize).filter((session): session is AgentSession => !!session)
}

function saveSessions(sessions: AgentSession[]): void {
  writeJsonFile(storeFile(), sessions, 'terminal sessions')
}

function sameSessions(a: AgentSession[], b: AgentSession[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function upsertPersistedSession(session: AgentSession): void {
  const sessions = readSessions()
  const i = sessions.findIndex((s) => s.id === session.id)
  if (i === -1) sessions.push(session)
  else sessions[i] = { ...sessions[i], ...session }
  saveSessions(sessions)
}

export function patchPersistedSession(id: string, patch: Partial<AgentSession>): void {
  const sessions = readSessions()
  const i = sessions.findIndex((s) => s.id === id)
  if (i === -1) return
  sessions[i] = { ...sessions[i], ...patch }
  saveSessions(sessions)
}

export function removePersistedSession(id: string): void {
  const sessions = readSessions()
  const next = sessions.filter((s) => s.id !== id)
  if (next.length !== sessions.length) saveSessions(next)
}

function staleRunningSession(session: AgentSession): AgentSession {
  if (session.status !== 'running') return session
  return {
    ...session,
    status: 'exited',
    pid: undefined,
    exitCode: null
  }
}

/**
 * Merge the authoritative live daemon list with the last UI snapshot. Live PTYs
 * win; sessions missing from the daemon are kept as restartable dead cells.
 */
export function reconcilePersistedSessions(live: AgentSession[]): AgentSession[] {
  const persisted = readSessions()
  const liveById = new Map(live.map((s) => [s.id, s]))
  const seen = new Set<string>()
  const next: AgentSession[] = []

  for (const stored of persisted) {
    const running = liveById.get(stored.id)
    if (running) {
      next.push(running)
      seen.add(stored.id)
    } else {
      next.push(staleRunningSession(stored))
    }
  }

  for (const session of live) {
    if (!seen.has(session.id)) next.push(session)
  }

  if (!sameSessions(persisted, next)) saveSessions(next)
  return next
}
