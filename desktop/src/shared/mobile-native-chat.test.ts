import { describe, expect, it } from 'vitest'
import { mobileChatSnapshot, mobileApprovalNeedsDesktop } from './mobile-native-chat'
import type { NativeChat } from './native-chat'
describe('mobile native chat previews', () => {
  it('bounds a large Unicode conversation below relay packet size', () => {
    const chat: NativeChat = { id: 'c', workspaceId: 'w', cwd: '/repo', title: 'chat', plan: false, status: 'waiting', createdAt: 1,
      items: Array.from({ length: 200 }, (_, i) => ({ id: String(i), turnId: 'turn', title: 'tool', kind: 'tool', text: '🐳'.repeat(10000), complete: true })),
      approvals: [{ id: 'a', kind: 'files', title: 'Review changes', detail: '🐳'.repeat(10000) }] }
    const snapshot = mobileChatSnapshot(chat)
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.items).toHaveLength(12)
    expect(snapshot.approvals[0].requiresDesktop).toBe(true)
    expect(snapshot.approvals[0].detail).toBe('')
    expect(Buffer.byteLength(JSON.stringify(snapshot)) * 4 / 3 + 2000).toBeLessThan(262144)
  })
  it('preserves the complete contents of an approvable request', () => {
    const approval = { id: 'a', kind: 'command' as const, title: 'Run tests', detail: 'npm test' }
    expect(mobileApprovalNeedsDesktop(approval)).toBe(false)
  })
})
