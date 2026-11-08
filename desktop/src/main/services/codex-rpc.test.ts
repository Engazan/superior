import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('child_process', () => ({ spawn: mocks.spawn }))
import { CodexRpc } from './codex-rpc'
function fixture() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
  mocks.spawn.mockReturnValue(child)
  const event = vi.fn(), ended = vi.fn()
  return { child, event, ended, rpc: new CodexRpc('/repo', event, ended) }
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('Codex JSONL transport', () => {
  it('handles split frames and server request ids independently', async () => {
    const { rpc, child, event } = fixture()
    const result = rpc.request('initialize', {})
    child.stdout.write('{"id":1,"res')
    child.stdout.write('ult":{"ok":true}}\n{"id":1,"method":"approval","params":{}}\n')
    expect(await result).toEqual({ ok: true })
    expect(event).toHaveBeenCalledWith({ id: 1, method: 'approval', params: {} })
    rpc.close()
  })
  it('fails pending requests once on process loss without retrying', async () => {
    const { rpc, child, ended } = fixture()
    const result = rpc.request('turn/start', {})
    const rejected = expect(result).rejects.toThrow('connection closed')
    child.emit('exit', 1)
    await rejected
    child.emit('exit', 1)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
    await expect(rpc.request('thread/resume', {})).rejects.toThrow('closed')
  })
})
