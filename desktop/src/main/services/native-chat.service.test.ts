import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ request: vi.fn(), write: vi.fn(), event: undefined as undefined | ((message: Record<string, unknown>) => void), persisted: [] as unknown[] }))
vi.mock('../lib/jsonStore', () => ({ userDataFile: (p: string) => p, readJsonFile: () => [], writeJsonFile: (_p: string, data: unknown[]) => { mock.persisted = JSON.parse(JSON.stringify(data)) } }))
vi.mock('./workspace.service', () => ({ listWorkspaces: () => ({ folders: [{ path: '/repo' }], workspaces: [{ id: 'w', folderPath: '/repo' }] }) }))
vi.mock('./worktree-setup.service', () => ({ ensureSetupReady: async () => {} }))
vi.mock('./codex-rpc', () => ({ CodexRpc: class {
  constructor(_cwd: string, event: typeof mock.event) { mock.event = event }
  request = mock.request
  write = mock.write
  close() {}
} }))
import { listNativeChats, nativeChatAction } from './native-chat.service'

describe('native chat lifecycle', () => {
  beforeEach(() => {
    mock.request.mockImplementation(async (method: string) => method === 'thread/start' || method === 'thread/resume' || method === 'thread/fork'
      ? { thread: { id: 'thread', turns: [] }, model: 'configured-model' }
      : method === 'turn/start' ? { turn: { id: 'turn' } } : {})
    mock.write.mockClear()
  })
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
