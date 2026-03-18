import { ipcMain } from 'electron'
import {
  IPC,
  type CustomMemoryMutationResult,
  type CustomMemoryPreset,
  type PresetsState,
  type TerminalPreset
} from '@shared/types'
import {
  deletePreset,
  listPresets,
  pickPresetImage,
  reorderPresets,
  savePreset,
  setPresetActive
} from '../services/presets.service'
import {
  addCustomMemoryAlias,
  addCustomMemoryTerminalPreset,
  createCustomMemoryPreset,
  listCustomMemoryPresets
} from '../services/custom-memory.service'

export function registerPresetsIpc(): void {
  ipcMain.handle(IPC.PRESETS_LIST, (): PresetsState => listPresets())

  ipcMain.handle(IPC.PRESETS_SAVE, (_e, preset: TerminalPreset): PresetsState => savePreset(preset))

  ipcMain.handle(IPC.PRESETS_DELETE, (_e, id: string): PresetsState => deletePreset(id))

  ipcMain.handle(IPC.PRESETS_REORDER, (_e, orderedIds: string[]): PresetsState =>
    reorderPresets(orderedIds)
  )

  ipcMain.handle(
    IPC.PRESETS_SET_ACTIVE,
    (_e, payload: { id: string; active: boolean }): PresetsState =>
      setPresetActive(payload.id, payload.active)
  )

  ipcMain.handle(IPC.PRESETS_PICK_IMAGE, (): Promise<{ dataUrl: string } | null> =>
    pickPresetImage()
  )

  ipcMain.handle(IPC.CUSTOM_MEMORY_LIST, (): CustomMemoryPreset[] =>
    listCustomMemoryPresets()
  )

  ipcMain.handle(
    IPC.CUSTOM_MEMORY_CREATE,
    (
      _event,
      payload: { provider: string; name: string }
    ): CustomMemoryMutationResult => createCustomMemoryPreset(payload.provider, payload.name)
  )

  ipcMain.handle(
    IPC.CUSTOM_MEMORY_ADD_ALIAS,
    (_event, directoryName: string): CustomMemoryPreset[] =>
      addCustomMemoryAlias(directoryName)
  )

  ipcMain.handle(
    IPC.CUSTOM_MEMORY_ADD_TERMINAL_PRESET,
    (_event, directoryName: string): CustomMemoryMutationResult =>
      addCustomMemoryTerminalPreset(directoryName)
  )
}
