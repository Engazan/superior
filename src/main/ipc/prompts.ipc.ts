import { IPC, type Prompt, type PromptsState } from '@shared/types'
import { deletePrompt, listPrompts, savePrompt } from '../services/prompts.service'
import { handle } from './handle'
import { invalidPayload, isPrompt, validId } from './validation'

export function registerPromptsIpc(): void {
  handle(IPC.PROMPTS_LIST, (): PromptsState => listPrompts())

  handle(IPC.PROMPTS_SAVE, (prompt: Prompt): PromptsState =>
    isPrompt(prompt) ? savePrompt(prompt) : invalidPayload()
  )

  handle(IPC.PROMPTS_DELETE, (id: string): PromptsState =>
    validId(id) ? deletePrompt(id) : invalidPayload()
  )
}
