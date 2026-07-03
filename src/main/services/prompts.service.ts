import type { Prompt, PromptsState } from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

function storeFile(): string {
  return userDataFile('prompts.json')
}

function save(state: PromptsState): void {
  writeJsonFile(storeFile(), state, 'prompts')
}

function read(): PromptsState {
  const parsed = readJsonFile<PromptsState | null>(storeFile(), null, (p) => {
    const obj = p as Partial<PromptsState>
    return obj && Array.isArray(obj.prompts) ? { prompts: obj.prompts } : null
  })
  return parsed ?? { prompts: [] }
}

export function listPrompts(): PromptsState {
  return read()
}

/** Upsert a prompt by id (adds when new, replaces when existing). */
export function savePrompt(prompt: Prompt): PromptsState {
  const state = read()
  const idx = state.prompts.findIndex((p) => p.id === prompt.id)
  if (idx >= 0) state.prompts[idx] = prompt
  else state.prompts.push(prompt)
  save(state)
  return state
}

export function deletePrompt(id: string): PromptsState {
  const state = read()
  state.prompts = state.prompts.filter((p) => p.id !== id)
  save(state)
  return state
}
