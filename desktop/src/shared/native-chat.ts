export interface ChatItem {
  id: string
  turnId: string
  kind: 'user' | 'assistant' | 'tool' | 'plan'
  title: string
  text: string
  complete: boolean
}
export interface ChatApproval {
  id: string
  kind: 'command' | 'files' | 'question'
  title: string
  detail: string
  questions?: { id: string; question: string; secret: boolean; options: string[] }[]
}
export interface WorkerSummary {
  id: string
  workspaceId: string
  title: string
  status: NativeChat['status']
  branch?: string
  summary: string
}
export interface NativeChat {
  coordinator?: boolean
  parentId?: string
  dispatchCallId?: string
  stopRequested?: boolean
  inbox?: { id: string; from: string; text: string; at: number }[]
  workers?: WorkerSummary[]

  id: string
  workspaceId: string
  cwd: string
  title: string
  threadId?: string
  model?: string
  plan: boolean
  status: 'idle' | 'working' | 'waiting' | 'interrupted' | 'error'
  items: ChatItem[]
  approvals: ChatApproval[]
  turnId?: string
  error?: string
  createdAt: number
}
export type ChatAction =
  | { type: 'create'; workspaceId: string; coordinator?: boolean }
  | { type: 'send'; id: string; text: string; plan: boolean }
  | { type: 'stop'; id: string }
  | { type: 'message'; id: string; to: string; text: string }
  | { type: 'answer'; id: string; requestId: string; decision?: 'accept' | 'decline'; answers?: Record<string, string> }
  | { type: 'fork'; id: string; turnId: string }
  | { type: 'delete'; id: string }

export function chatItem(raw: Record<string, unknown>, turnId: string, complete: boolean): ChatItem {
  const type = String(raw.type)
  const content = Array.isArray(raw.content) ? raw.content as { text?: string }[] : []
  const text = type === 'userMessage' ? content.map(c => c.text ?? '').join('\n')
    : type === 'agentMessage' || type === 'plan' ? String(raw.text ?? '')
    : type === 'commandExecution' ? `${raw.command ?? ''}\n${raw.aggregatedOutput ?? ''}`
    : type === 'fileChange' ? JSON.stringify(raw.changes ?? [], null, 2)
    : JSON.stringify(raw, null, 2)
  return { id: String(raw.id), turnId, kind: type === 'userMessage' ? 'user' : type === 'agentMessage' ? 'assistant' : type === 'plan' ? 'plan' : 'tool',
    title: type, text: text.slice(0, 500_000), complete }
}

export type NativeChatSummary = Pick<NativeChat, 'id' | 'workspaceId' | 'title' | 'plan' | 'status'>
