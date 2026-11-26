import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ request: vi.fn(), write: vi.fn(), event: undefined as undefined | ((message: Record<string, unknown>) => void), persisted: [] as unknown[], workspaces: [{ id: 'w', folderPath: '/repo' }] as { id: string; folderPath: string; branch?: string; worktreePath?: string }[], worktree: vi.fn() }))
vi.mock('../lib/jsonStore', () => ({ userDataFile: (p: string) => p, readJsonFile: () => [], writeJsonFile: (_p: string, data: unknown[]) => { mock.persisted = JSON.parse(JSON.stringify(data)) } }))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./git-runner', () => ({ runGit: async () => 'a'.repeat(40) }))
vi.mock('./workspace.service', () => ({ listWorkspaces: () => ({ folders: [{ path: '/repo' }], workspaces: mock.workspaces }), addWorktreeWorkspace: mock.worktree }))
vi.mock('./worktree-setup.service', () => ({ ensureSetupReady: async () => {} }))
vi.mock('./codex-rpc', () => ({ CodexRpc: class {
  constructor(_cwd: string, event: typeof mock.event) { mock.event = event }
  request = mock.request
  write = mock.write
  close() {}
} }))
import { listNativeChats, nativeChatAction } from './native-chat.service'

beforeEach(() => {
    mock.request.mockImplementation(async (method: string) => method === 'thread/start' || method === 'thread/resume' || method === 'thread/fork'
      ? { thread: { id: 'thread', turns: [] }, model: 'configured-model' }
      : method === 'turn/start' ? { turn: { id: 'turn' } } : {})
    mock.write.mockClear()
    mock.worktree.mockImplementation(async (args: { branch: string }) => {
      mock.workspaces.push({ id: args.branch, folderPath: '/repo', worktreePath: `/trees/${args.branch}`, branch: args.branch })
      return { workspaces: mock.workspaces }
    })
  })
describe('native chat lifecycle', () => {
  it('uses the configured model for plan mode and requires a matching approval', async () => {
    const chat = (await nativeChatAction({ type: 'create', workspaceId: 'w' }))!
    await nativeChatAction({ type: 'send', id: chat.id, text: 'Plan the fix', plan: true })
    expect(mock.request).toHaveBeenCalledWith('turn/start', expect.objectContaining({ collaborationMode: { mode: 'plan', settings: { model: 'configured-model', reasoning_effort: null, developer_instructions: null } } }))
    mock.event!({ id: 88, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread', itemId: 'cmd', command: 'npm test' } })
    expect(chat.status).toBe('waiting')
    await expect(nativeChatAction({ type: 'answer', id: chat.id, requestId: 'stale', decision: 'accept' })).rejects.toThrow('no longer pending')
    const requestId = chat.approvals[0].id
    await nativeChatAction({ type: 'answer', id: chat.id, requestId, decision: 'decline' })
    expect(mock.write).toHaveBeenCalledWith({ id: 88, result: { decision: 'decline' } })
    await expect(nativeChatAction({ type: 'answer', id: chat.id, requestId, decision: 'accept' })).rejects.toThrow('no longer pending')
    mock.event!({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'failed', error: { message: 'failed check' } } } })
    expect(chat.status).toBe('error')
    expect(chat.error).toBe('failed check')
    expect(listNativeChats('w').find(c => c.id === chat.id)?.plan).toBe(true)
  })
  it('rejects unsupported server requests and only forks completed responses', async () => {
    const chat = (await nativeChatAction({ type: 'create', workspaceId: 'w' }))!
    await nativeChatAction({ type: 'send', id: chat.id, text: 'Hello', plan: false })
    mock.event!({ id: 'unknown', method: 'item/permissions/requestApproval', params: { threadId: 'thread' } })
    expect(mock.write).toHaveBeenCalledWith(expect.objectContaining({ id: 'unknown', error: expect.anything() }))
    mock.event!({ method: 'item/completed', params: { threadId: 'thread', turnId: 'turn', item: { id: 'reply', type: 'agentMessage', text: 'Done' } } })
    mock.event!({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } } })
    await expect(nativeChatAction({ type: 'fork', id: chat.id, turnId: 'missing' })).rejects.toThrow('completed response')
    const fork = await nativeChatAction({ type: 'fork', id: chat.id, turnId: 'turn' })
    expect(fork?.id).not.toBe(chat.id)
    expect(mock.request).toHaveBeenCalledWith('thread/fork', expect.objectContaining({ lastTurnId: 'turn' }))
  })
})

describe('scoped worker orchestration', () => {
  it('reserves one dispatch per tool call and creates an isolated checkout from coordinator HEAD', async () => {
    const chat = (await nativeChatAction({ type: 'create', workspaceId: 'w', coordinator: true }))!
    await nativeChatAction({ type: 'send', id: chat.id, text: 'Delegate a fix', plan: false })
    const coordinatorEvent = mock.event!
    const call = { id: 501, method: 'item/tool/call', params: { threadId: 'thread', callId: 'dispatch-once', tool: 'superior_worker_start', arguments: { name: 'Tests', prompt: 'Add missing tests' } } }
    coordinatorEvent(call)
    await vi.waitFor(() => expect(mock.worktree).toHaveBeenCalledTimes(1))
    coordinatorEvent({ ...call, id: 502 })
    await vi.waitFor(() => expect(mock.write).toHaveBeenCalledWith(expect.objectContaining({ id: 502, result: expect.objectContaining({ success: true }) })))
    expect(mock.worktree).toHaveBeenCalledTimes(1)
    expect(mock.worktree.mock.calls[0][2]).toBe('a'.repeat(40))
    const worker = listNativeChats('w').find(c => c.id === chat.id)!.workers![0]
    expect(worker.branch).toMatch(/^worker\//)
    await nativeChatAction({ type: 'message', id: chat.id, to: worker.id, text: 'Only edit tests.' })
    expect(listNativeChats(worker.workspaceId)[0].inbox?.at(-1)?.text).toBe('Only edit tests.')
    const stranger = (await nativeChatAction({ type: 'create', workspaceId: 'w' }))!
    await expect(nativeChatAction({ type: 'message', id: stranger.id, to: worker.id, text: 'wrong coordinator' })).rejects.toThrow('limited')
    await nativeChatAction({ type: 'stop', id: chat.id })
    expect(listNativeChats(worker.workspaceId)[0].stopRequested).toBe(true)
  })

  it('lets the user add a worker to a coordinator, but not to a plain chat', async () => {
    const coordinator = (await nativeChatAction({ type: 'create', workspaceId: 'w', coordinator: true }))!
    const calls = mock.worktree.mock.calls.length
    await nativeChatAction({ type: 'addWorker', id: coordinator.id, name: 'Docs', prompt: 'Document the outline option' })
    await vi.waitFor(() => expect(mock.worktree).toHaveBeenCalledTimes(calls + 1))
    const added = listNativeChats('w').find(c => c.id === coordinator.id)!.workers!
    expect(added.map(w => w.title)).toEqual(['Docs'])
    const plain = (await nativeChatAction({ type: 'create', workspaceId: 'w' }))!
    await expect(nativeChatAction({ type: 'addWorker', id: plain.id, name: 'Docs', prompt: 'x' })).rejects.toThrow('only be added to a coordinator')
    await expect(nativeChatAction({ type: 'addWorker', id: coordinator.id, name: ' ', prompt: 'x' })).rejects.toThrow('Invalid worker task')
  })
})
