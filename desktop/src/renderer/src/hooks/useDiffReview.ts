import { useCallback, useState } from 'react'
import { REVIEW_STORAGE_KEY, restoreReviewNotes, type ReviewNote } from '../diffReview'

export function useDiffReview(scope: string) {
  const [all, setAll] = useState(() => {
    try { return restoreReviewNotes(localStorage.getItem(REVIEW_STORAGE_KEY)) } catch { return {} }
  })
  const [storageFailed, setStorageFailed] = useState(false)
  const update = useCallback((notes: ReviewNote[]) => {
    const next = { ...all, [scope]: notes }
    if (!notes.length) delete next[scope]
    // Save before updating the UI; the in-memory draft remains usable on storage failure.
    try { localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(next)); setStorageFailed(false) }
    catch { setStorageFailed(true) }
    setAll(next)
  }, [all, scope])
  return { notes: all[scope] ?? [], update, storageFailed }
}
