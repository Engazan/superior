import { useCallback, useState } from 'react'
import type { FsEntry } from '../types'

interface PreviewPaneApi {
  /** File held in the editor tab (null = no file tab). */
  previewFile: FsEntry | null
  /** Whether the file tab, rather than a terminal tab, is currently selected. */
  previewActive: boolean
  /** Open a file in the editor tab and select it; null closes the tab. */
  setPreviewFile: (file: FsEntry | null) => void
  showPreview: () => void
  hidePreview: () => void
}

/** Owns the transient file-editor tab and which surface is selected. */
export function usePreviewPane(): PreviewPaneApi {
  const [previewFile, setPreviewFileState] = useState<FsEntry | null>(null)
  const [previewActive, setPreviewActive] = useState(false)

  const setPreviewFile = useCallback((file: FsEntry | null): void => {
    setPreviewFileState(file)
    setPreviewActive(file !== null)
  }, [])

  const showPreview = useCallback((): void => {
    setPreviewActive(true)
  }, [])

  const hidePreview = useCallback((): void => {
    setPreviewActive(false)
  }, [])

  return { previewFile, previewActive, setPreviewFile, showPreview, hidePreview }
}
