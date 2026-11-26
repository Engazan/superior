import { IPC } from '@shared/types'
import { listNativeChats, readNativeChat, nativeChatAction } from '../services/native-chat.service'
import { handle } from './handle'
import { validId, invalidPayload } from './validation'
export function registerNativeChatIpc(): void {
  handle(IPC.CHAT_GET, id => validId(id) ? readNativeChat(id) : invalidPayload())
  handle(IPC.CHAT_LIST, id => validId(id) ? listNativeChats(id).map(c => ({ id: c.id, workspaceId: c.workspaceId, title: c.title, plan: c.plan, status: c.status, coordinator: c.coordinator === true })) : invalidPayload())
  handle(IPC.CHAT_ACTION, action => nativeChatAction(action))
}
