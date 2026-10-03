import type { Prompt, PromptsState } from '@shared/types'
import { createJsonListStore } from '../lib/jsonStore'

const store = createJsonListStore<Prompt>('prompts.json', 'prompts', 'prompts')

export function listPrompts(): PromptsState {
  return { prompts: store.read() }
}

/** Upsert a prompt by id (adds when new, replaces when existing). */
export function savePrompt(prompt: Prompt): PromptsState {
  return { prompts: store.upsert(prompt) }
}

export function deletePrompt(id: string): PromptsState {
  return { prompts: store.remove(id) }
}
