import { randomUUID } from 'crypto'
import { chatItem, type ChatAction, type NativeChat, type ChatApproval } from '@shared/native-chat'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'
import { listWorkspaces } from './workspace.service'
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
  return all().filter(c => c.workspaceId === workspaceId)
}
function event(chat: NativeChat, message: RpcRecord): void {
  const method = String(message.method)
  const p = (message.params ?? {}) as RpcRecord
  if (p.threadId && p.threadId !== chat.threadId) return
  if (message.id !== undefined) {
    if (!['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput'].includes(method)) {
      clients.get(chat.id)?.write({ id: message.id, error: { code: -32601, message: 'This request is not supported by Superior.' } }); return
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
    const rpc = new CodexRpc(chat.cwd, message => event(chat, message), error => {
      clients.delete(chat.id); chat.status = 'interrupted'; chat.error = error.message; chat.approvals = []
      for (const key of requests.keys()) if (key.startsWith(`${chat.id}:`)) requests.delete(key)
      try { persist() } catch { /* Keep state in memory when disk is unavailable. */ }
    })
    clients.set(chat.id, rpc)
    try {
      await rpc.request('initialize', { clientInfo: { name: 'superior', title: 'Superior', version: '1' }, capabilities: { experimentalApi: true, requestAttestation: false } })
      rpc.write({ method: 'initialized' })
      const result = await rpc.request(chat.threadId ? 'thread/resume' : 'thread/start', {
        ...(chat.threadId ? { threadId: chat.threadId } : {}), cwd: chat.cwd, sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user'
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
      title: 'Codex', plan: false, status: 'idle', items: [], approvals: [], createdAt: Date.now() }
    all().push(chat); persist(); return chat
  }
  if (typeof action.id !== 'string') throw new Error('Invalid chat id.')
  const chat = get(action.id)
  workspace(chat.workspaceId)
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
  if (action.type === 'stop') {
    const rpc = clients.get(chat.id)
    if (rpc && chat.turnId) await rpc.request('turn/interrupt', { threadId: chat.threadId, turnId: chat.turnId })
    return chat
  }
  if (locks.has(chat.id)) throw new Error('Chat is processing another request.')
  locks.add(chat.id)
  try {
    if (action.type === 'delete') {
      if (chat.status === 'working' || chat.status === 'waiting') throw new Error('Stop this chat before deleting it.')
      clients.get(chat.id)?.close(); chats = all().filter(c => c.id !== chat.id); persist(); return null
    }
    if (chat.status === 'working' || chat.status === 'waiting') throw new Error('Wait for this turn or stop it first.')
    if (action.type === 'send') {
      if (typeof action.text !== 'string' || !action.text.trim() || action.text.length > 100_000 || typeof action.plan !== 'boolean') throw new Error('Invalid chat message.')
      const rpc = await connect(chat)
      chat.plan = action.plan; chat.error = undefined
      if (chat.title === 'Codex') chat.title = action.text.trim().slice(0, 60)
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
      const fork: NativeChat = { ...chat, id: randomUUID(), threadId: String(thread.id), title: `${chat.title} (fork)`, createdAt: Date.now(), approvals: [], turnId: undefined, status: 'idle',
        items: Array.isArray(thread.turns) ? (thread.turns as RpcRecord[]).flatMap(t => Array.isArray(t.items) ? (t.items as RpcRecord[]).map(i => chatItem(i, String(t.id), true)) : []) : [] }
      all().push(fork); persist(); return fork
    }
    throw new Error('Unknown chat action.')
  } catch (error) { chat.error = (error as Error).message; if (!chat.approvals.length) chat.status = 'error'; persist(); throw error }
  finally { locks.delete(chat.id) }
}
export function stopNativeChats(): void { for (const client of clients.values()) client.close() }
