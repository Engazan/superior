import { BrowserWindow } from 'electron'
import { IPC } from '@shared/types'
import { orchestrationTools } from '@shared/orchestration'
import { runGit } from './git-runner'
import { randomUUID } from 'crypto'
import { chatItem, type ChatAction, type NativeChat, type ChatApproval } from '@shared/native-chat'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'
import { addWorktreeWorkspace, listWorkspaces } from './workspace.service'
import { ensureSetupReady } from './worktree-setup.service'
import { CodexRpc, type RpcRecord } from './codex-rpc'

let chats: NativeChat[] | undefined
const clients = new Map<string, CodexRpc>()
const starting = new Map<string, Promise<CodexRpc>>()
const requests = new Map<string, { wireId: string | number; method: string }>()
const locks = new Set<string>()
function all(): NativeChat[] {
  if (!chats) chats = readJsonFile<NativeChat[]>(userDataFile('native-chats.json'), [], value => Array.isArray(value) ? value.filter(v =>
    v && typeof v.id === 'string' && typeof v.workspaceId === 'string' && typeof v.cwd === 'string' && Array.isArray(v.items))
    .map(v => ({ ...v, approvals: [], status: ['working', 'waiting'].includes(v.status) ? 'interrupted' : v.status })) : null)
  return chats
}
function persist(): void {
  writeJsonFile(userDataFile('native-chats.json'), all().map(c => ({ ...c, approvals: [] })), 'chats')
}
function get(id: string): NativeChat {
  const chat = all().find(c => c.id === id)
  if (!chat) throw new Error('Chat no longer exists.')
  return chat
}
function workspace(id: string) {
  const state = listWorkspaces()
  const ws = state.workspaces.find(w => w.id === id)
  if (!ws || state.folders.find(f => f.path === ws.folderPath)?.remote) throw new Error('Native chat requires an existing local workspace.')
  return ws
}
export function listNativeChats(workspaceId: string): NativeChat[] {
  workspace(workspaceId)
  return all().filter(c => c.workspaceId === workspaceId).map(c => ({ ...c, workers: workerSummaries(c.id) }))
}
function event(chat: NativeChat, message: RpcRecord, connection: CodexRpc): void {
  const method = String(message.method)
  const p = (message.params ?? {}) as RpcRecord
  if (p.threadId && p.threadId !== chat.threadId) return
  if (message.id !== undefined) {
    if (method === 'item/tool/call' && (chat.coordinator || chat.parentId)) {
      void workerTool(chat, p).then(result => {
        try { connection.write({ id: message.id, result: { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(result) }] } }) } catch { /* disconnected */ }
      }, error => {
        try { connection.write({ id: message.id, result: { success: false, contentItems: [{ type: 'inputText', text: String(error) }] } }) } catch { /* disconnected */ }
      })
      return
    }
    if (!['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput'].includes(method)) {
      connection.write({ id: message.id, error: { code: -32601, message: 'This request is not supported by Superior.' } }); return
    }
    const id = randomUUID()
    requests.set(`${chat.id}:${id}`, { wireId: message.id as string | number, method })
    const item = chat.items.find(i => i.id === p.itemId)
    const questions = Array.isArray(p.questions) ? (p.questions as RpcRecord[]).map(q => ({ id: String(q.id), question: String(q.question), secret: q.isSecret === true,
      options: Array.isArray(q.options) ? (q.options as RpcRecord[]).map(o => String(o.label)) : [] })) : undefined
    const approval: ChatApproval = { id, kind: method.includes('UserInput') ? 'question' : method.includes('fileChange') ? 'files' : 'command',
      title: String(p.reason || p.command || method), detail: item?.text || String(p.command || p.reason || p.grantRoot || ''), questions }
    chat.approvals.push(approval); chat.status = 'waiting'; return
  }
  if (method === 'item/started' || method === 'item/completed') {
    const raw = p.item as RpcRecord | undefined
    if (!raw || typeof raw.id !== 'string') return
    const item = chatItem(raw, String(p.turnId ?? ''), method === 'item/completed')
    const index = chat.items.findIndex(i => i.id === item.id)
    if (index < 0) chat.items.push(item); else chat.items[index] = item
    if (chat.items.length > 1000) chat.items.splice(0, chat.items.length - 1000)
  } else if (method === 'item/agentMessage/delta' || method === 'item/commandExecution/outputDelta' || method === 'item/plan/delta') {
    const item = chat.items.find(i => i.id === p.itemId)
    if (item) item.text = (item.text + String(p.delta ?? '')).slice(0, 500_000)
  } else if (method === 'turn/started') {
    chat.turnId = String((p.turn as RpcRecord).id); chat.status = 'working'
  } else if (method === 'turn/completed') {
    const turn = p.turn as RpcRecord
    chat.status = turn.status === 'completed' ? 'idle' : turn.status === 'interrupted' ? 'interrupted' : 'error'
    chat.error = turn.error ? String((turn.error as RpcRecord).message ?? 'Turn failed.') : undefined
    chat.turnId = undefined; chat.approvals = []
    for (const key of requests.keys()) if (key.startsWith(`${chat.id}:`)) requests.delete(key)
    persist()
  } else if (method === 'serverRequest/resolved') {
    for (const [key, request] of requests) if (key.startsWith(`${chat.id}:`) && request.wireId === p.requestId) {
      chat.approvals = chat.approvals.filter(a => `${chat.id}:${a.id}` !== key); requests.delete(key)
    }
    if (!chat.approvals.length && chat.status === 'waiting') chat.status = 'working'
  }
}
async function connect(chat: NativeChat): Promise<CodexRpc> {
  const existing = clients.get(chat.id)
  if (starting.has(chat.id)) return starting.get(chat.id)!
  if (existing) return existing
  if (clients.size >= 8) {
    const idle = all().find(c => clients.has(c.id) && c.status !== 'working' && c.status !== 'waiting' && !starting.has(c.id))
    if (idle) clients.get(idle.id)?.close()
    else throw new Error('At most eight chats can run at the same time.')
  }
  const ws = workspace(chat.workspaceId)
  if ((ws.worktreePath ?? ws.folderPath) !== chat.cwd) throw new Error('Workspace path changed. Start a new chat.')
  const promise = (async () => {
    await ensureSetupReady(ws)
    if (chat.stopRequested) throw new Error('Chat stopped.')
    const rpc = new CodexRpc(chat.cwd, message => event(chat, message, rpc), error => {
      clients.delete(chat.id); chat.status = 'interrupted'; chat.error = error.message; chat.approvals = []
      for (const key of requests.keys()) if (key.startsWith(`${chat.id}:`)) requests.delete(key)
      try { persist() } catch { /* Keep state in memory when disk is unavailable. */ }
    })
    clients.set(chat.id, rpc)
    try {
      await rpc.request('initialize', { clientInfo: { name: 'superior', title: 'Superior', version: '1' }, capabilities: { experimentalApi: true, requestAttestation: false } })
      rpc.write({ method: 'initialized' })
      const result = await rpc.request(chat.threadId ? 'thread/resume' : 'thread/start', {
        ...(chat.threadId ? { threadId: chat.threadId } : (chat.coordinator || chat.parentId) ? { dynamicTools: orchestrationTools(chat.coordinator === true) } : {}),
        ...((chat.coordinator || chat.parentId) ? { developerInstructions: chat.coordinator
          ? 'You coordinate independent tasks using superior_worker_start, superior_workers and superior_message. Assign explicit ownership and bounded tasks. Wait for workers and inspect their final summaries before claiming completion. Report blockers. Each worker has an isolated worktree; uncommitted changes are not shared. Do not push. Do not merge work without inspecting results. Check your inbox between steps.'
          : 'You are an isolated worker. Do not create additional workers. Check superior_workers for inbox messages between steps. If blocked, send superior_message to parent. Do not push or merge. Finish with a concise summary of changed files, validation, local commit ids and remaining blockers.' } : {}), cwd: chat.cwd, sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user'
      })
      const thread = result.thread as RpcRecord
      chat.threadId = String(thread.id); chat.model = String(result.model)
      if (Array.isArray(thread.turns)) chat.items = (thread.turns as RpcRecord[]).flatMap(turn =>
        Array.isArray(turn.items) ? (turn.items as RpcRecord[]).map(item => chatItem(item, String(turn.id), turn.status !== 'inProgress')) : []).slice(-1000)
      chat.status = 'idle'; chat.error = undefined; persist()
      return rpc
    } catch (error) { rpc.close(); throw error }
  })()
  starting.set(chat.id, promise)
  try { return await promise } finally { starting.delete(chat.id) }
}
export async function nativeChatAction(action: ChatAction): Promise<NativeChat | null> {
  if (!action || typeof action !== 'object') throw new Error('Invalid chat action.')
  if (action.type === 'create') {
    const ws = workspace(action.workspaceId)
    if (all().length >= 200) throw new Error('Delete an old chat before creating more chats.')
    const chat: NativeChat = { id: randomUUID(), workspaceId: ws.id, cwd: ws.worktreePath ?? ws.folderPath,
      coordinator: action.coordinator === true, title: action.coordinator ? 'Coordinator' : 'Codex', plan: false, status: 'idle', items: [], approvals: [], createdAt: Date.now() }
    all().push(chat); persist(); return chat
  }
  if (typeof action.id !== 'string') throw new Error('Invalid chat id.')
  const chat = get(action.id)
  if (action.type !== 'stop' && action.type !== 'delete') workspace(chat.workspaceId)
  if (action.type === 'answer') {
    const approval = chat.approvals.find(a => a.id === action.requestId)
    const request = requests.get(`${chat.id}:${action.requestId}`)
    const rpc = clients.get(chat.id)
    if (!approval || !request || !rpc) throw new Error('This request is no longer pending.')
    let result: RpcRecord
    if (approval.kind === 'question') {
      const answers: Record<string, { answers: string[] }> = {}
      for (const q of approval.questions ?? []) {
        const answer = action.answers?.[q.id]
        if (typeof answer !== 'string' || !answer.trim() || answer.length > 10000) throw new Error('Answer each question.')
        answers[q.id] = { answers: [answer] }
      }
      result = { answers }
    } else {
      if (!['accept', 'decline'].includes(action.decision ?? '')) throw new Error('Invalid approval decision.')
      result = { decision: action.decision }
    }
    rpc.write({ id: request.wireId, result })
    requests.delete(`${chat.id}:${action.requestId}`)
    chat.approvals = chat.approvals.filter(a => a.id !== action.requestId)
    chat.status = chat.approvals.length ? 'waiting' : 'working'
    return chat
  }
  if (action.type === 'message') { deliverMail(chat, action.to, action.text); return chat }
  if (action.type === 'stop') {
    chat.stopRequested = true
    await Promise.allSettled(all().filter(c => c.parentId === chat.id).map(child => nativeChatAction({ type: 'stop', id: child.id })))
    const rpc = clients.get(chat.id)
    if (rpc && chat.turnId) await rpc.request('turn/interrupt', { threadId: chat.threadId, turnId: chat.turnId })
    else { rpc?.close(); chat.status = 'interrupted' }
    persist()
    return chat
  }
  if (locks.has(chat.id)) throw new Error('Chat is processing another request.')
  locks.add(chat.id)
  try {
    if (action.type === 'delete') {
      if (chat.status === 'working' || chat.status === 'waiting') throw new Error('Stop this chat before deleting it.')
      if (all().some(c => c.parentId === chat.id && ['working', 'waiting'].includes(c.status))) throw new Error('Stop workers before deleting the coordinator.')
      clients.get(chat.id)?.close(); chats = all().filter(c => c.id !== chat.id); persist(); return null
    }
    if (chat.status === 'working' || chat.status === 'waiting') throw new Error('Wait for this turn or stop it first.')
    if (action.type === 'send') {
      if (typeof action.text !== 'string' || !action.text.trim() || action.text.length > 100_000 || typeof action.plan !== 'boolean') throw new Error('Invalid chat message.')
      chat.stopRequested = false
      const rpc = await connect(chat)
      if (chat.stopRequested) throw new Error('Chat stopped.')
      chat.plan = action.plan; chat.error = undefined
      if (chat.title === 'Codex' || chat.title === 'Coordinator') chat.title = action.text.trim().slice(0, 60)
      chat.status = 'working'; persist()
      const result = await rpc.request('turn/start', { threadId: chat.threadId, input: [{ type: 'text', text: action.text, text_elements: [] }],
        collaborationMode: { mode: chat.plan ? 'plan' : 'default', settings: { model: chat.model, reasoning_effort: null, developer_instructions: null } } })
      // Completion may arrive before the response; never restore a completed turn to working.
      if (chat.status === 'working') chat.turnId = String((result.turn as RpcRecord).id)
      return chat
    }
    if (action.type === 'fork') {
      if (all().length >= 200) throw new Error('Delete an old chat before creating more chats.')
      if (!chat.items.some(i => i.turnId === action.turnId && i.kind === 'assistant' && i.complete)) throw new Error('Select a completed response to fork.')
      const rpc = await connect(chat)
      const result = await rpc.request('thread/fork', { threadId: chat.threadId, lastTurnId: action.turnId, cwd: chat.cwd, sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user' })
      const thread = result.thread as RpcRecord
      const fork: NativeChat = { ...chat, id: randomUUID(), threadId: String(thread.id), title: `${chat.title} (fork)`, parentId: undefined, dispatchCallId: undefined, inbox: [], workers: [], stopRequested: false, createdAt: Date.now(), approvals: [], turnId: undefined, status: 'idle',
        items: Array.isArray(thread.turns) ? (thread.turns as RpcRecord[]).flatMap(t => Array.isArray(t.items) ? (t.items as RpcRecord[]).map(i => chatItem(i, String(t.id), true)) : []) : [] }
      all().push(fork); persist(); return fork
    }
    throw new Error('Unknown chat action.')
  } catch (error) { chat.error = (error as Error).message; if (!chat.approvals.length) chat.status = chat.stopRequested ? 'interrupted' : 'error'; persist(); throw error }
  finally { locks.delete(chat.id) }
}
export function stopNativeChats(): void { for (const client of clients.values()) client.close() }

function workerSummaries(parentId: string) {
  const state = listWorkspaces()
  return all().filter(c => c.parentId === parentId).map(c => ({ id: c.id, workspaceId: c.workspaceId, title: c.title, status: c.status,
    branch: state.workspaces.find(w => w.id === c.workspaceId)?.branch,
    summary: c.error || c.items.filter(i => i.kind === 'assistant' && i.complete).at(-1)?.text.slice(-12000) || '' }))
}
function deliverMail(chat: NativeChat, to: string, text: string): void {
  if (typeof text !== 'string' || !text.trim() || text.length > 10000) throw new Error('Invalid worker message.')
  const target = get(to === 'parent' ? chat.parentId ?? '' : to)
  if (target.id !== chat.parentId && target.parentId !== chat.id) throw new Error('Messages are limited to this coordinator and its workers.')
  target.inbox = [...(target.inbox ?? []), { id: randomUUID(), from: chat.id, text, at: Date.now() }].slice(-100)
  persist()
}
async function workerTool(chat: NativeChat, params: RpcRecord): Promise<unknown> {
  if (chat.stopRequested) throw new Error('Coordinator stopped.')
  const args = params.arguments as RpcRecord
  if (!args || typeof args !== 'object') throw new Error('Invalid tool arguments.')
  if (params.tool === 'superior_message') {
    deliverMail(chat, String(args.to), String(args.text)); return { delivered: true }
  }
  if (params.tool === 'superior_workers') {
    const seconds = args.waitSeconds
    if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 0 || seconds > 25) throw new Error('Invalid wait duration.')
    const state = () => ({ workers: workerSummaries(chat.parentId ?? chat.id), inbox: chat.inbox ?? [] })
    const before = JSON.stringify(state())
    const end = Date.now() + seconds * 1000
    while (!chat.stopRequested && Date.now() < end && JSON.stringify(state()) === before) await new Promise(resolve => setTimeout(resolve, 500))
    return state()
  }
  if (params.tool !== 'superior_worker_start' || !chat.coordinator || chat.parentId || chat.plan) throw new Error('Worker dispatch is only available in coordinator execution mode.')
  if (typeof args.name !== 'string' || !args.name.trim() || args.name.length > 80 || typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 50000 || typeof params.callId !== 'string') throw new Error('Invalid worker task.')
  const previous = all().find(c => c.parentId === chat.id && c.dispatchCallId === params.callId)
  if (previous) return { dispatchId: previous.id, status: previous.status }
  if (all().filter(c => c.parentId === chat.id && ['working', 'waiting'].includes(c.status)).length >= 3) throw new Error('Three workers are already running. Wait for a result before dispatching another.')
  if (all().length >= 200) throw new Error('Chat history limit reached.')
  const worker: NativeChat = { id: randomUUID(), workspaceId: chat.workspaceId, cwd: chat.cwd, title: args.name,
    parentId: chat.id, dispatchCallId: params.callId, plan: false, status: 'working', items: [], approvals: [], createdAt: Date.now() }
  all().push(worker); persist()
  const prompt = args.prompt
  void (async () => {
    try {
      const parent = workspace(chat.workspaceId)
      const base = await runGit(chat.cwd, ['rev-parse', 'HEAD'])
      if (worker.stopRequested || chat.stopRequested) return
      const state = await addWorktreeWorkspace({ folderPath: parent.folderPath, name: args.name as string, branch: `worker/${worker.id}`, createBranch: true }, false, base)
      const ws = state.workspaces.find(w => w.branch === `worker/${worker.id}`)
      if (!ws?.worktreePath) throw new Error('Worker worktree was not created.')
      worker.workspaceId = ws.id; worker.cwd = ws.worktreePath
      persist()
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(IPC.WORKSPACE_STATE_CHANGED, { ...state, source: 'tasks' })
      if (worker.stopRequested || chat.stopRequested) return
      worker.status = 'idle'
      await nativeChatAction({ type: 'send', id: worker.id, text: `Task ownership: ${args.name}\nDispatch: ${worker.id}\nBase commit: ${base}\n\n${prompt}\n\nWork only in your isolated worktree. Do not push or merge. Report changed files, checks, local commit ids and blockers in the final response.`, plan: false })
    } catch (error) { worker.status = worker.stopRequested ? 'interrupted' : 'error'; worker.error = (error as Error).message; persist() }
  })().catch(error => console.error('[workers] failed to persist worker result:', error))
  return { dispatchId: worker.id, status: 'preparing', base: 'Coordinator committed HEAD; uncommitted edits are not copied.' }
}
