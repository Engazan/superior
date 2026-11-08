export interface AgentContext {
  text: string
  source: string
  workspaceId?: string
  firstLine?: number
  lastLine?: number
}
export const AGENT_CONTEXT_EVENT = 'superior:agent-context'
export function requestAgentContext(context: AgentContext): void {
  if (context.text.trim()) window.dispatchEvent(new CustomEvent(AGENT_CONTEXT_EVENT, { detail: context }))
}
export function contextPrompt(context: AgentContext, instruction: string): string {
  const location = context.firstLine ? `:${context.firstLine}-${context.lastLine ?? context.firstLine}` : ''
  // Terminal controls must never become input to the recipient terminal.
  return `${instruction.trim()}\n\nSource: ${context.source}${location}\nSelected context (may contain unsaved edits):\n${context.text}`
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
}
