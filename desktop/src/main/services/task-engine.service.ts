import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import { IPC, type AgentTask } from '@shared/types'
import { buildTaskCommand } from '@shared/task-command'
import { listTasks, saveTask, finishTaskRun } from './tasks.service'
import { daemonClient } from './daemonClient'
import { startAgent, killAgent } from './agent.service'
import { listPresets } from './presets.service'
import { addWorktreeWorkspace, listWorkspaces } from './workspace.service'
import { ensureSetupReady, runSetup, getSetupState, cancelSetup } from './worktree-setup.service'
import { getTabs, setTabs } from './layout.service'

const launching = new Set<string>()
const canceling = new Set<string>()
const prechecks = new Map<string, ChildProcess>()
let stopped = true
let timer: ReturnType<typeof setTimeout> | undefined
function current(id: string): AgentTask | undefined { return listTasks().tasks.find(t => t.id === id) }
function active(id: string): boolean { return !stopped && !canceling.has(id) && current(id)?.status === 'running' }
function publish(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC.WORKSPACE_STATE_CHANGED, { ...listWorkspaces(), source: 'tasks' })
  }
}
function killPrecheck(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.on('error', () => child.kill())
  } else {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }
}
function precheck(task: AgentTask, cwd: string): Promise<boolean> {
  if (!task.precheck) return Promise.resolve(true)
  return new Promise(resolve => {
    const windows = process.platform === 'win32'
    const child = spawn(windows ? 'cmd.exe' : process.env.SHELL || '/bin/sh', windows ? ['/d', '/s', '/c', `"${task.precheck!}"`] : ['-l', '-c', task.precheck!],
      { cwd, detached: !windows, windowsHide: true, windowsVerbatimArguments: windows, stdio: 'ignore' })
    prechecks.set(task.id, child)
    const timeout = setTimeout(() => killPrecheck(child), 60_000)
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true; clearTimeout(timeout); prechecks.delete(task.id); resolve(ok)
    }
    child.once('error', () => finish(false))
    child.once('exit', code => finish(code === 0))
  })
}
async function launch(task: AgentTask): Promise<void> {
  launching.add(task.id)
  try {
    saveTask({ ...task, status: 'running', startedAt: Date.now() })
    const preset = listPresets().presets.find(p => p.id === task.presetId)
    if (!preset) throw new Error('preset-missing')
    const state = listWorkspaces()
    if (!state.folders.some(f => f.path === task.folderPath)) throw new Error('no-workspace')
    if (state.folders.find(f => f.path === task.folderPath)?.remote) throw new Error('Scheduled tasks require a local project.')
    if (!await precheck(task, task.folderPath)) {
      finishTaskRun(task.id, { status: 'done', outcome: 'skipped_precheck' }); return
    }
    if (!active(task.id)) return
    let workspace = task.workspaceId ? state.workspaces.find(w => w.id === task.workspaceId && w.folderPath === task.folderPath) : undefined
    if (task.useWorktree && !workspace?.worktreePath) {
      const branch = `task/${task.id}`
      const next = await addWorktreeWorkspace({ folderPath: task.folderPath, name: task.prompt.slice(0, 32), branch, createBranch: true }, false)
      workspace = next.workspaces.find(w => w.branch === branch && w.folderPath === task.folderPath)
    } else if (!workspace) {
      workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId && w.folderPath === task.folderPath) ?? state.workspaces.find(w => w.folderPath === task.folderPath)
    }
    if (!workspace) throw new Error('no-workspace')
    if (!active(task.id)) return
    saveTask({ ...current(task.id)!, workspaceId: workspace.id, branch: workspace.branch })
    publish()
    try {
      if (getSetupState(workspace)?.status === 'failed') await runSetup(workspace)
      await ensureSetupReady(workspace)
    } catch (error) { throw new Error(`setup-failed: ${(error as Error).message}`) }
    if (!active(task.id)) return
    const layouts = getTabs()
    let tabId = layouts[workspace.id]?.activeTabId
    if (!tabId) {
      tabId = randomUUID()
      setTabs(workspace.id, { activeTabId: tabId, tabs: [{ id: tabId, name: 'Tasks' }] })
    }
    const result = await startAgent({ command: buildTaskCommand(preset.command, task.prompt, process.platform),
      label: preset.name, nickname: task.prompt.slice(0, 32), iconType: preset.iconType, icon: preset.icon, color: preset.color,
      workspaceId: workspace.id, tabId, cwd: workspace.worktreePath ?? workspace.folderPath })
    if ('error' in result) throw new Error(result.error)
    if (!active(task.id)) { await killAgent(result.session.id); return }
    saveTask({ ...current(task.id)!, sessionId: result.session.id })
    if (result.session.status !== 'running') finishTaskRun(task.id, { status: result.session.exitCode === 0 ? 'done' : 'failed', exitCode: result.session.exitCode ?? null })
    publish()
  } catch (error) {
    if (active(task.id)) finishTaskRun(task.id, { status: 'failed', error: (error as Error).message })
  } finally { launching.delete(task.id) }
}

export async function cancelTaskRun(id: string): Promise<void> {
  const task = current(id)
  if (!task || (task.status !== 'running' && task.status !== 'queued')) return
  canceling.add(id)
  try {
    const child = prechecks.get(id)
    if (child) killPrecheck(child)
    if (task.sessionId) await killAgent(task.sessionId)
    else if (task.workspaceId) await cancelSetup(task.workspaceId)
    saveTask({ ...current(id)!, status: 'canceled', finishedAt: Date.now() })
  } finally { canceling.delete(id) }
}
async function tick(): Promise<void> {
  try {
    const sessions = await daemonClient.list()
    if (stopped) return
    for (const task of listTasks().tasks.filter(t => t.status === 'running')) {
      if (launching.has(task.id) || canceling.has(task.id)) continue
      const session = sessions.find(s => s.id === task.sessionId)
      if (!session || session.status !== 'running') {
        const exitCode = session?.exitCode ?? null
        finishTaskRun(task.id, { status: exitCode === 0 ? 'done' : 'failed', exitCode, ...(exitCode === null ? { error: 'terminal-interrupted' } : {}) })
      } else if (task.timeoutMinutes && Date.now() - (task.startedAt ?? Date.now()) > task.timeoutMinutes * 60_000) {
        await killAgent(session.id)
        finishTaskRun(task.id, { status: 'failed', error: 'Task timed out.' })
      }
    }
    const state = listTasks()
    if (!state.paused) {
      const busy = new Set(state.tasks.filter(t => t.status === 'running').map(t => t.folderPath))
      for (const task of [...state.tasks].sort((a, b) => a.createdAt - b.createdAt)) {
        if (task.status !== 'queued' || busy.has(task.folderPath) || (task.scheduledAt ?? 0) > Date.now()) continue
        busy.add(task.folderPath)
        void launch(task).catch(error => console.error('[tasks] launch:', error))
      }
    }
  } catch (error) { console.error('[tasks] reconcile:', error) }
  if (!stopped) timer = setTimeout(() => void tick(), 1000)
}
export function startTaskEngine(): void {
  if (!stopped) return
  stopped = false
  void tick()
}
export function stopTaskEngine(): void {
  stopped = true
  clearTimeout(timer)
  for (const child of prechecks.values()) killPrecheck(child)
}
