import { ipcMain } from 'electron'
import { IPC, type PresetsState, type TerminalPreset } from '@shared/types'
import {
  deletePreset,
  listPresets,
  pickPresetImage,
  reorderPresets,
  savePreset,
  setPresetActive
} from '../services/presets.service'

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
}
