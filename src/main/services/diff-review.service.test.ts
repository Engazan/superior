import { beforeEach, describe, expect, it, vi } from 'vitest'
const daemon = vi.hoisted(() => ({ list: vi.fn(), inputChecked: vi.fn() }))
vi.mock('./daemonClient', () => ({ daemonClient: daemon }))
import { sendReview } from './diff-review.service'

const args = { sessionId: 'agent-1', workspaceId: 'workspace-1', folderPath: '/repo', prompt: 'Review one\n\nReview two' }
const session = { id: args.sessionId, status: 'running', meta: { cwd: '/repo', workspaceId: args.workspaceId, command: 'claude' } }
beforeEach(() => { vi.resetAllMocks(); daemon.list.mockResolvedValue([session]); daemon.inputChecked.mockResolvedValue(undefined) })

describe('sendReview', () => {
  it('sends a single bracketed batch plus Enter to the selected session', async () => {
    await sendReview(args)
    expect(daemon.inputChecked).toHaveBeenCalledExactlyOnceWith(args.sessionId, `\x1b[200~${args.prompt}\x1b[201~\r`)
  })
  it.each([
    [], [{ ...session, status: 'exited' }],
    [{ ...session, meta: { ...session.meta, workspaceId: 'other' } }],
    [{ ...session, meta: { ...session.meta, cwd: '/other' } }],
    [{ ...session, meta: { ...session.meta, command: '' } }],
    [{ ...session, meta: { ...session.meta, launchTarget: { kind: 'remote' } } }]
  ])('rejects an unavailable or mismatched target (%j)', async (...list) => {
    daemon.list.mockResolvedValue(list)
    await expect(sendReview(args)).rejects.toThrow('no longer available')
    expect(daemon.inputChecked).not.toHaveBeenCalled()
  })
  it('propagates daemon lookup and write failures without retrying the batch', async () => {
    daemon.list.mockRejectedValueOnce(new Error('offline'))
    await expect(sendReview(args)).rejects.toThrow('offline')
    expect(daemon.inputChecked).not.toHaveBeenCalled()
    daemon.inputChecked.mockRejectedValueOnce(new Error('disconnected'))
    await expect(sendReview(args)).rejects.toThrow('disconnected')
    expect(daemon.inputChecked).toHaveBeenCalledTimes(1)
  })
  it.each(['', ' ', 'unsafe\x1b[201~', 'unsafe\r', 'x'.repeat(1_000_001)])('rejects empty, oversized or terminal-control input', async (prompt) => {
    await expect(sendReview({ ...args, prompt })).rejects.toThrow('Invalid review')
    expect(daemon.list).not.toHaveBeenCalled()
  })
})
