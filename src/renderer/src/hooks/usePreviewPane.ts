import { useCallback, useState } from 'react'
import type { FsEntry } from '../types'

interface PreviewPaneApi {
  /** File held in the editor tab (null = no file tab). */
  previewFile: FsEntry | null
  /** One-based line requested by a content-search/file-link open. */
  previewLine: number | null
  /** Changes on every open request so selecting the same match reveals it again. */
  previewRequestId: number
  /** Whether the file tab, rather than a terminal tab, is currently selected. */
  previewActive: boolean
  /** Open a file in the editor tab and select it; null closes the tab. */
  setPreviewFile: (file: FsEntry | null, line?: number) => void
  showPreview: () => void
  hidePreview: () => void
}

/** Owns the transient file-editor tab and which surface is selected. */
export function usePreviewPane(): PreviewPaneApi {
  const [previewFile, setPreviewFileState] = useState<FsEntry | null>(null)
  const [previewLine, setPreviewLine] = useState<number | null>(null)
  const [previewRequestId, setPreviewRequestId] = useState(0)
  const [previewActive, setPreviewActive] = useState(false)

  const setPreviewFile = useCallback((file: FsEntry | null, line?: number): void => {
    setPreviewFileState(file)
    setPreviewLine(file && line && line > 0 ? line : null)
    if (file) setPreviewRequestId((id) => id + 1)
    setPreviewActive(file !== null)
  }, [])

  const showPreview = useCallback((): void => {
    setPreviewActive(true)
  }, [])

  const hidePreview = useCallback((): void => {
    setPreviewActive(false)
  }, [])

  return {
    previewFile,
    previewLine,
    previewRequestId,
    previewActive,
    setPreviewFile,
    showPreview,
    hidePreview
  }
}
