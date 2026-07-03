import { ipcMain } from 'electron'
import { IPC, type Prompt, type PromptsState } from '@shared/types'
import { deletePrompt, listPrompts, savePrompt } from '../services/prompts.service'

export function registerPromptsIpc(): void {
  ipcMain.handle(IPC.PROMPTS_LIST, (): PromptsState => listPrompts())

  ipcMain.handle(IPC.PROMPTS_SAVE, (_e, prompt: Prompt): PromptsState => savePrompt(prompt))

  ipcMain.handle(IPC.PROMPTS_DELETE, (_e, id: string): PromptsState => deletePrompt(id))
}
