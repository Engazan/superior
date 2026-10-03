import { useCallback, useEffect, useState } from 'react'
import type { LayoutPreset } from '../types'

interface LayoutPresetsApi {
  layouts: LayoutPreset[]
  saveLayout: (layout: LayoutPreset) => Promise<void>
  deleteLayout: (id: string) => Promise<void>
}

/** Saved launch layouts (grid + a terminal preset per slot), mirroring persisted state. */
export function useLayoutPresets(): LayoutPresetsApi {
  const [layouts, setLayouts] = useState<LayoutPreset[]>([])

  useEffect(() => {
    window.api.listLayoutPresets().then((state) => setLayouts(state.layouts))
  }, [])

  const saveLayout = useCallback(async (layout: LayoutPreset) => {
    setLayouts((await window.api.saveLayoutPreset(layout)).layouts)
  }, [])
  const deleteLayout = useCallback(async (id: string) => {
    setLayouts((await window.api.deleteLayoutPreset(id)).layouts)
  }, [])

  return { layouts, saveLayout, deleteLayout }
}
