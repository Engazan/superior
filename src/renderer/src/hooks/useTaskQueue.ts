import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentSession,
  AgentTask,
  StartAgentResult,
  TerminalPreset,
  Workspace,
  WorkspaceState
} from '../types'

interface Deps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  sessionsRestored: boolean
  sessions: AgentSession[]
  presets: TerminalPreset[]
  /** Adopt a WorkspaceState returned by main (worktree creation). */
  applyState: (state: WorkspaceState) => void
  /** Start a preset command in a workspace without stealing focus. */
  launchSessionIn: (args: {
    preset: TerminalPreset
    workspaceId: string
    cwd: string
    command?: string
    nickname?: string
  }) => Promise<StartAgentResult>
}

export interface TaskQueueApi {
  tasks: AgentTask[]
  paused: boolean
  addTask: (args: {
    folderPath: string
    prompt: string
    presetId: string
    useWorktree: boolean
  }) => Promise<void>
  /** Delete a queued/finished task (running tasks must be canceled instead). */
  deleteTask: (id: string) => Promise<void>
  /** Kill a running task's terminal and mark it canceled. */
  cancelTask: (id: string) => Promise<void>
  clearFinished: (folderPath: string) => Promise<void>
  setPaused: (paused: boolean) => Promise<void>
}

/** Quote a prompt as a single shell argument for the daemon's launch shell
 *  (`$SHELL -l -c …` on POSIX, `cmd.exe /c …` on Windows). */
function quoteArg(text: string): string {
  if (window.api.platform === 'win32') {
    // cmd.exe: double quotes; literal " doubled, trailing \ would eat the close quote.
    return `"${text.replace(/"/g, '""').replace(/\\$/, '\\\\')}"`
  }
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/** Filesystem/ref-safe branch slug from a prompt's first words. */
function promptSlug(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '')
  return slug || 'task'
}

/** Short human label for sidebar/nickname use. */
function promptExcerpt(prompt: string): string {
  const line = prompt.trim().split('\n')[0]
  return line.length > 32 ? `${line.slice(0, 32)}…` : line
}

/**
 * The task-queue engine. Tasks persist in main (tasks.json); this hook mirrors
 * that state and drives execution: per folder it runs one task at a time,
 * spawning `<preset command> '<prompt>'` in the target workspace (optionally a
 * freshly created worktree workspace) and starting the next queued task when
 * the previous task's terminal exits. Lives in the renderer because tabs and
 * session state are owned here.
 */
export function useTaskQueue(deps: Deps): TaskQueueApi {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [paused, setPausedState] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // Set once stale 'running' tasks from a previous run were reconciled against
  // surviving daemon sessions; the engine only starts tasks after this.
  const [ready, setReady] = useState(false)

  // The engine's async callbacks always read current state through refs, so
  // exit events arriving between renders never act on stale tasks/deps.
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const depsRef = useRef(deps)
  depsRef.current = deps
  // Tasks currently mid-start (worktree creation + spawn are async).
  const startingRef = useRef(new Set<string>())

  const adopt = useCallback((state: { tasks: AgentTask[]; paused: boolean }) => {
    setTasks(state.tasks)
    setPausedState(state.paused)
  }, [])

  const persistTask = useCallback(
    async (task: AgentTask) => {
      adopt(await window.api.saveTask(task))
    },
    [adopt]
  )

  useEffect(() => {
    window.api.listTasks().then((state) => {
      adopt(state)
      setLoaded(true)
    })
  }, [adopt])

  // Reconcile tasks stored as 'running' by a previous app run: a task whose
  // session survived in the daemon keeps running (its exit is caught below);
  // one whose session is gone finished unobserved — close it with an unknown
  // exit code rather than blocking its folder's queue forever.
  const reconciledRef = useRef(false)
  useEffect(() => {
    if (!loaded || !deps.sessionsRestored || reconciledRef.current) return
    reconciledRef.current = true
    ;(async () => {
      for (const task of tasksRef.current) {
        if (task.status !== 'running') continue
        const session = depsRef.current.sessions.find((s) => s.id === task.sessionId)
        if (session && session.status === 'running') continue
        const exitCode = session?.exitCode ?? null
        await persistTask({
          ...task,
          status: exitCode !== null && exitCode !== 0 ? 'failed' : 'done',
          exitCode,
          finishedAt: Date.now()
        })
      }
    })()
      .catch((err) => console.error('[tasks] reconcile failed:', err))
      // Even a failed reconcile must not stall the queue forever.
      .finally(() => setReady(true))
  }, [loaded, deps.sessionsRestored, persistTask])

  // Terminal exits drive queue progress: finish the matching running task.
  useEffect(() => {
    return window.api.onAgentExit(({ id, exitCode }) => {
      const task = tasksRef.current.find((t) => t.sessionId === id && t.status === 'running')
      if (!task) return
      void persistTask({
        ...task,
        status: exitCode === 0 ? 'done' : 'failed',
        exitCode,
        finishedAt: Date.now()
      })
    })
  }, [persistTask])

  const failTask = useCallback(
    (task: AgentTask, error: string) =>
      persistTask({ ...task, status: 'failed', error, finishedAt: Date.now() }),
    [persistTask]
  )

  const startTask = useCallback(
    async (task: AgentTask) => {
      const d = depsRef.current
      const preset = d.presets.find((p) => p.id === task.presetId)
      if (!preset) {
        await failTask(task, 'preset-missing')
        return
      }

      let workspaceId: string
      let cwd: string
      let branch: string | undefined

      if (task.useWorktree) {
        branch = `task/${promptSlug(task.prompt)}-${task.id.slice(0, 4)}`
        const res = await window.api.addWorktreeWorkspace({
          folderPath: task.folderPath,
          name: promptExcerpt(task.prompt),
          branch,
          createBranch: true
        })
        if ('error' in res) {
          await failTask(task, res.error)
          return
        }
        const created = res.workspaces.find(
          (w) => w.folderPath === task.folderPath && w.branch === branch
        )
        if (!created?.worktreePath) {
          await failTask(task, 'worktree-missing')
          return
        }
        // Creating a worktree workspace activates it in main; queued tasks run
        // in the background, so put the user's selection back before adopting.
        const prevActive = d.activeWorkspaceId
        const state =
          prevActive && prevActive !== res.activeWorkspaceId
            ? await window.api.setActiveWorkspace(prevActive)
            : res
        d.applyState(state)
        workspaceId = created.id
        cwd = created.worktreePath
      } else {
        // Run in the folder's current context: the active workspace when it
        // belongs to this folder, else the folder's first workspace.
        const ws =
          d.workspaces.find(
            (w) => w.id === d.activeWorkspaceId && w.folderPath === task.folderPath
          ) ?? d.workspaces.find((w) => w.folderPath === task.folderPath)
        if (!ws) {
          await failTask(task, 'no-workspace')
          return
        }
        workspaceId = ws.id
        cwd = ws.worktreePath ?? task.folderPath
      }

      // Mark running before the spawn resolves so the engine can't double-start.
      const running: AgentTask = {
        ...task,
        status: 'running',
        workspaceId,
        branch,
        startedAt: Date.now()
      }
      const command = `${preset.command} ${quoteArg(task.prompt)}`.trim()
      const res = await depsRef.current.launchSessionIn({
        preset,
        workspaceId,
        cwd,
        command,
        nickname: promptExcerpt(task.prompt)
      })
      if ('error' in res) {
        await failTask(running, res.error)
        return
      }
      await persistTask({ ...running, sessionId: res.session.id })
    },
    [failTask, persistTask]
  )

  // The pump: whenever the queue can make progress, start the oldest queued
  // task of every folder that has nothing running (one at a time per folder).
  useEffect(() => {
    if (!ready || paused) return
    const busyFolders = new Set(
      tasks.filter((t) => t.status === 'running').map((t) => t.folderPath)
    )
    for (const id of startingRef.current) {
      const t = tasks.find((x) => x.id === id)
      if (t) busyFolders.add(t.folderPath)
    }
    const next = new Map<string, AgentTask>()
    for (const t of tasks) {
      if (t.status !== 'queued' || busyFolders.has(t.folderPath)) continue
      const cur = next.get(t.folderPath)
      if (!cur || t.createdAt < cur.createdAt) next.set(t.folderPath, t)
    }
    for (const task of next.values()) {
      startingRef.current.add(task.id)
      void startTask(task).finally(() => startingRef.current.delete(task.id))
    }
  }, [tasks, paused, ready, startTask])

  const addTask = useCallback(
    async (args: {
      folderPath: string
      prompt: string
      presetId: string
      useWorktree: boolean
    }) => {
      await persistTask({
        id: crypto.randomUUID(),
        folderPath: args.folderPath,
        prompt: args.prompt.trim(),
        presetId: args.presetId,
        useWorktree: args.useWorktree,
        status: 'queued',
        createdAt: Date.now()
      })
    },
    [persistTask]
  )

  const deleteTask = useCallback(
    async (id: string) => {
      adopt(await window.api.deleteTask(id))
    },
    [adopt]
  )

  const cancelTask = useCallback(
    async (id: string) => {
      const task = tasksRef.current.find((t) => t.id === id)
      if (!task || task.status !== 'running') return
      // Mark canceled first so the exit event of the kill is ignored.
      await persistTask({ ...task, status: 'canceled', finishedAt: Date.now() })
      if (task.sessionId) void window.api.killAgent(task.sessionId)
    },
    [persistTask]
  )

  const clearFinished = useCallback(
    async (folderPath: string) => {
      adopt(await window.api.clearFinishedTasks(folderPath))
    },
    [adopt]
  )

  const setPaused = useCallback(
    async (value: boolean) => {
      adopt(await window.api.setTasksPaused(value))
    },
    [adopt]
  )

  return { tasks, paused, addTask, deleteTask, cancelTask, clearFinished, setPaused }
}
