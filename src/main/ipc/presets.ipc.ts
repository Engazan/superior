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
import {
  boundedString,
  boundedStringArray,
  invalidPayload,
  isLayoutPreset,
  isRecord,
  isTerminalPreset,
  validId
} from './validation'

export function registerPresetsIpc(): void {
  handle(IPC.PRESETS_LIST, (): PresetsState => listPresets())

  handle(IPC.PRESETS_SAVE, (preset: TerminalPreset): PresetsState =>
    isTerminalPreset(preset) ? savePreset(preset) : invalidPayload()
  )

  handle(IPC.PRESETS_DELETE, (id: string): PresetsState =>
    validId(id) ? deletePreset(id) : invalidPayload()
  )

  handle(IPC.PRESETS_REORDER, (orderedIds: string[]): PresetsState =>
    boundedStringArray(orderedIds) ? reorderPresets(orderedIds) : invalidPayload()
  )

  handle(
    IPC.PRESETS_SET_ACTIVE,
    (payload: { id: string; active: boolean }): PresetsState =>
      isRecord(payload) && validId(payload.id) && typeof payload.active === 'boolean'
        ? setPresetActive(payload.id, payload.active)
        : invalidPayload()
  )

  handle(IPC.PRESETS_PICK_IMAGE, (): Promise<{ dataUrl: string } | null> =>
    pickPresetImage()
  )

  handle(IPC.LAYOUT_PRESETS_LIST, (): LayoutPresetsState => listLayoutPresets())

  handle(
    IPC.LAYOUT_PRESETS_SAVE,
    (layout: LayoutPreset): LayoutPresetsState =>
      isLayoutPreset(layout) ? saveLayoutPreset(layout) : invalidPayload()
  )

  handle(
    IPC.LAYOUT_PRESETS_DELETE,
    (id: string): LayoutPresetsState => validId(id) ? deleteLayoutPreset(id) : invalidPayload()
  )

  handle(IPC.CUSTOM_MEMORY_LIST, (): CustomMemoryPreset[] =>
    listCustomMemoryPresets()
  )

  handle(
    IPC.CUSTOM_MEMORY_CREATE,
    (
      payload: { provider: string; name: string }
    ): CustomMemoryMutationResult =>
      isRecord(payload) &&
      (payload.provider === 'claude' || payload.provider === 'codex') &&
      boundedString(payload.name, 1_000)
        ? createCustomMemoryPreset(payload.provider, payload.name)
        : invalidPayload()
  )

  handle(
    IPC.CUSTOM_MEMORY_ADD_ALIAS,
    (directoryName: string): CustomMemoryPreset[] =>
      boundedString(directoryName, 1_000) ? addCustomMemoryAlias(directoryName) : invalidPayload()
  )

  handle(
    IPC.CUSTOM_MEMORY_ADD_TERMINAL_PRESET,
    (directoryName: string): CustomMemoryMutationResult =>
      boundedString(directoryName, 1_000)
        ? addCustomMemoryTerminalPreset(directoryName)
        : invalidPayload()
  )

  handle(IPC.CLI_TOOLS_CHECK, (force?: boolean): Promise<CliToolStatus[]> =>
    checkCliTools(force === true)
  )

  handle(IPC.CLI_TOOL_FIX, (id: CliToolId): Promise<CliToolFixResult> =>
    id === 'claude' || id === 'codex'
      ? fixCliTool(id)
      : invalidPayload()
  )
}
