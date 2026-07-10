import {
  IPC,
  type CliToolFixResult,
  type CliToolId,
  type CliToolStatus,
  type CustomMemoryMutationResult,
  type CustomMemoryPreset,
  type LayoutPreset,
  type LayoutPresetsState,
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
  deleteLayoutPreset,
  listLayoutPresets,
  saveLayoutPreset
} from '../services/layout-presets.service'
import {
  addCustomMemoryAlias,
  addCustomMemoryTerminalPreset,
  createCustomMemoryPreset,
  listCustomMemoryPresets
} from '../services/custom-memory.service'
import { checkCliTools, fixCliTool } from '../services/cli-tools.service'
import { handle } from './handle'

export function registerPresetsIpc(): void {
  handle(IPC.PRESETS_LIST, (): PresetsState => listPresets())

  handle(IPC.PRESETS_SAVE, (preset: TerminalPreset): PresetsState => savePreset(preset))

  handle(IPC.PRESETS_DELETE, (id: string): PresetsState => deletePreset(id))

  handle(IPC.PRESETS_REORDER, (orderedIds: string[]): PresetsState =>
    reorderPresets(orderedIds)
  )

  handle(
    IPC.PRESETS_SET_ACTIVE,
    (payload: { id: string; active: boolean }): PresetsState =>
      setPresetActive(payload.id, payload.active)
  )

  handle(IPC.PRESETS_PICK_IMAGE, (): Promise<{ dataUrl: string } | null> =>
    pickPresetImage()
  )

  handle(IPC.LAYOUT_PRESETS_LIST, (): LayoutPresetsState => listLayoutPresets())

  handle(
    IPC.LAYOUT_PRESETS_SAVE,
    (layout: LayoutPreset): LayoutPresetsState => saveLayoutPreset(layout)
  )

  handle(
    IPC.LAYOUT_PRESETS_DELETE,
    (id: string): LayoutPresetsState => deleteLayoutPreset(id)
  )

  handle(IPC.CUSTOM_MEMORY_LIST, (): CustomMemoryPreset[] =>
    listCustomMemoryPresets()
  )

  handle(
    IPC.CUSTOM_MEMORY_CREATE,
    (
      payload: { provider: string; name: string }
    ): CustomMemoryMutationResult => createCustomMemoryPreset(payload.provider, payload.name)
  )

  handle(
    IPC.CUSTOM_MEMORY_ADD_ALIAS,
    (directoryName: string): CustomMemoryPreset[] =>
      addCustomMemoryAlias(directoryName)
  )

  handle(
    IPC.CUSTOM_MEMORY_ADD_TERMINAL_PRESET,
    (directoryName: string): CustomMemoryMutationResult =>
      addCustomMemoryTerminalPreset(directoryName)
  )

  handle(IPC.CLI_TOOLS_CHECK, (force?: boolean): Promise<CliToolStatus[]> =>
    checkCliTools(force === true)
  )

  handle(IPC.CLI_TOOL_FIX, (id: CliToolId): Promise<CliToolFixResult> =>
    fixCliTool(id)
  )
}
