/** What an agent CLI reports about its own turn, from hooks or its terminal title. */
export type AgentState = 'working' | 'waiting' | 'idle'

export interface AgentStateEvent {
  id: string
  /** null: the agent ended; fall back to output-based activity. */
  state: AgentState | null
  /** Command text supplied by a shell-tool permission hook, if available. */
  pendingCommand?: string
}

const HOOK_STATES: Record<string, AgentState | null> = {
  UserPromptSubmit: 'working',
  PreToolUse: 'working',
  PostToolUse: 'working',
  // Also covers AskUserQuestion: either way the agent is blocked on the user.
  PermissionRequest: 'waiting',
  Stop: 'idle',
  SessionEnd: null
}

/** Map a Claude hook payload to a state; undefined means "not a state change". */
export function agentStateFromHook(payload: unknown): AgentState | null | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const name = (payload as { hook_event_name?: unknown }).hook_event_name
  return typeof name === 'string' && Object.hasOwn(HOOK_STATES, name) ? HOOK_STATES[name] : undefined
}

/** Only show the command the CLI supplied for a pending shell permission. */
export function pendingCommandFromHook(payload: unknown): string | undefined {
  if (agentStateFromHook(payload) !== 'waiting') return undefined
  const { tool_name, tool_input } = payload as { tool_name?: unknown; tool_input?: unknown }
  if (tool_name !== 'Bash' || !tool_input || typeof tool_input !== 'object') return undefined
  const { command } = tool_input as { command?: unknown }
  return typeof command === 'string' ? command.trim().slice(0, 2000) || undefined : undefined
}
