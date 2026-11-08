import { IPC } from '@shared/types'
import { listNativeChats, nativeChatAction } from '../services/native-chat.service'
import { handle } from './handle'
import { validId, invalidPayload } from './validation'
export function registerNativeChatIpc(): void {
  handle(IPC.CHAT_LIST, id => validId(id) ? listNativeChats(id) : invalidPayload())
  handle(IPC.CHAT_ACTION, action => nativeChatAction(action))
}
