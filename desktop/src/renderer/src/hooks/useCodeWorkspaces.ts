import { useCallback, useEffect, useState } from 'react'
import { emptyCodeWorkspace, reduceCodeWorkspace, restoreCodeWorkspaces, type CodeAction } from '../codeWorkspace'

const STORAGE_KEY = 'superior.codeWorkspaces.v1'
const EMPTY = emptyCodeWorkspace()

export function useCodeWorkspaces(workspaceId: string | null) {
  const [workspaces, setWorkspaces] = useState(() => {
    try { return restoreCodeWorkspaces(localStorage.getItem(STORAGE_KEY)) } catch { return {} }
  })
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces)) } catch { /* Navigation still works when storage is unavailable. */ }
  }, [workspaces])
  const dispatch = useCallback((id: string, action: CodeAction) => {
    setWorkspaces((all) => ({ ...all, [id]: reduceCodeWorkspace(all[id] ?? emptyCodeWorkspace(), action) }))
  }, [])
  const act = useCallback((action: CodeAction) => {
    if (workspaceId) dispatch(workspaceId, action)
  }, [workspaceId, dispatch])
  return { workspaces, current: workspaceId ? workspaces[workspaceId] ?? EMPTY : EMPTY, dispatch, act }
}
