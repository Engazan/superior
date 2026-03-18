import { useCallback, useEffect, useState } from 'react'
import type { TerminalPreset } from '../types'

interface PresetsApi {
  presets: TerminalPreset[]
  setPresets: (presets: TerminalPreset[]) => void
  savePreset: (preset: TerminalPreset) => Promise<void>
  deletePreset: (id: string) => Promise<void>
  reorderPresets: (ids: string[]) => Promise<void>
  togglePresetActive: (id: string, active: boolean) => Promise<void>
}

/** Terminal-preset list with CRUD that mirrors the persisted state locally. */
export function usePresets(): PresetsApi {
  const [presets, setPresets] = useState<TerminalPreset[]>([])

  useEffect(() => {
    window.api.listPresets().then((state) => setPresets(state.presets))
  }, [])

  const savePreset = useCallback(async (preset: TerminalPreset) => {
    setPresets((await window.api.savePreset(preset)).presets)
  }, [])
  const deletePreset = useCallback(async (id: string) => {
    setPresets((await window.api.deletePreset(id)).presets)
  }, [])
  const reorderPresets = useCallback(async (ids: string[]) => {
    setPresets((await window.api.reorderPresets(ids)).presets)
  }, [])
  const togglePresetActive = useCallback(async (id: string, active: boolean) => {
    setPresets((await window.api.setPresetActive(id, active)).presets)
  }, [])

  return { presets, setPresets, savePreset, deletePreset, reorderPresets, togglePresetActive }
}
