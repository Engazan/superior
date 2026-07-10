import { IPC, type Prompt, type PromptsState } from '@shared/types'
import { deletePrompt, listPrompts, savePrompt } from '../services/prompts.service'
import { handle } from './handle'

export function registerPromptsIpc(): void {
  handle(IPC.PROMPTS_LIST, (): PromptsState => listPrompts())

  handle(IPC.PROMPTS_SAVE, (prompt: Prompt): PromptsState => savePrompt(prompt))

  handle(IPC.PROMPTS_DELETE, (id: string): PromptsState => deletePrompt(id))
}
