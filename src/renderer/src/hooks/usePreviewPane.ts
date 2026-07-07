import { useCallback, useEffect, useRef, useState } from 'react'
import type { FsEntry } from '../types'

interface PreviewPaneApi {
  /** File previewed beside the terminal (null = none). */
  previewFile: FsEntry | null
  setPreviewFile: (file: FsEntry | null) => void
  /** Preview width as a fraction (0.2–0.8) of the main area. */
  previewWidth: number
  /** Attach to the row that wraps the terminal + preview for the resize math. */
  previewRowRef: React.RefObject<HTMLDivElement>
  /** Pointer-down on the divider: drag to set the preview width. */
  startPreviewResize: (e: React.PointerEvent) => void
}

/** File-preview pane state plus the divider drag-to-resize behavior. */
export function usePreviewPane(): PreviewPaneApi {
  const [previewFile, setPreviewFile] = useState<FsEntry | null>(null)
  const [previewWidth, setPreviewWidth] = useState(0.5)
  const previewRowRef = useRef<HTMLDivElement>(null)

  // Restore the persisted width once; drags persist on release (not per-move,
  // to avoid an IPC write per pointer event).
  const widthRestored = useRef(false)
  useEffect(() => {
    void window.api.getSettings().then((s) => {
      if (widthRestored.current) return
      widthRestored.current = true
      if (typeof s.ui.previewWidth === 'number') setPreviewWidth(s.ui.previewWidth)
    })
  }, [])

  const startPreviewResize = useCallback((e: React.PointerEvent): void => {
    e.preventDefault()
    const row = previewRowRef.current
    if (!row) return
    widthRestored.current = true
    let latest: number | null = null
    const move = (ev: PointerEvent): void => {
      const box = row.getBoundingClientRect()
      const fraction = (box.right - ev.clientX) / box.width
      latest = Math.min(0.8, Math.max(0.2, fraction))
      setPreviewWidth(latest)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (latest !== null) void window.api.setUiState({ previewWidth: latest })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  return { previewFile, setPreviewFile, previewWidth, previewRowRef, startPreviewResize }
}
