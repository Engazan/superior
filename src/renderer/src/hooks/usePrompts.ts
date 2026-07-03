import { useCallback, useEffect, useState } from 'react'
import type { Prompt } from '../types'

interface PromptsApi {
  prompts: Prompt[]
  savePrompt: (prompt: Prompt) => Promise<void>
  deletePrompt: (id: string) => Promise<void>
}

/** Saved prompt snippets, mirroring persisted state. */
export function usePrompts(): PromptsApi {
  const [prompts, setPrompts] = useState<Prompt[]>([])

  useEffect(() => {
    window.api.listPrompts().then((state) => setPrompts(state.prompts))
  }, [])

  const savePrompt = useCallback(async (prompt: Prompt) => {
    setPrompts((await window.api.savePrompt(prompt)).prompts)
  }, [])
  const deletePrompt = useCallback(async (id: string) => {
    setPrompts((await window.api.deletePrompt(id)).prompts)
  }, [])

  return { prompts, savePrompt, deletePrompt }
}
