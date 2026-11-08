import type { ChatApproval, NativeChat } from './native-chat'
export type MobileChatSummary = Pick<NativeChat, 'id' | 'title' | 'status' | 'plan'>
export interface MobileNativeChat extends NativeChat {
  truncated: boolean
  approvals: (ChatApproval & { requiresDesktop: boolean })[]
}
export function mobileApprovalNeedsDesktop(approval: ChatApproval): boolean {
  return JSON.stringify(approval).length > 5000
}
/** Keep the encrypted/base64 envelope below the relay packet limit, even for Unicode. */
export function mobileChatSnapshot(chat: NativeChat): MobileNativeChat {
  return { ...chat, title: chat.title.slice(0, 80), cwd: chat.cwd.slice(0, 1000), error: chat.error?.slice(0, 1000),
    truncated: chat.items.length > 12 || chat.items.some(i => i.text.length > 1000),
    items: chat.items.slice(-12).map(i => ({ ...i, title: i.title.slice(0, 100), text: i.text.slice(-1000) })),
    inbox: chat.inbox?.slice(-5).map(m => ({ ...m, text: m.text.slice(0, 500) })),
    workers: chat.workers?.slice(-3).map(w => ({ ...w, title: w.title.slice(0, 80), summary: w.summary.slice(-1000) })),
    approvals: chat.approvals.slice(0, 2).map(a => mobileApprovalNeedsDesktop(a)
      ? { id: a.id, kind: a.kind, title: a.title.slice(0, 100), detail: '', requiresDesktop: true }
      : { ...a, requiresDesktop: false }) }
}
