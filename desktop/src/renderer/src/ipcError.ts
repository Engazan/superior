/**
 * Electron rewraps a rejected ipcRenderer.invoke as
 * `Error invoking remote method '<channel>': Error: <original message>`.
 * Strip that envelope so user-facing messages — and stable error-code matching
 * (e.g. WORKTREE_ERROR) — see the original text.
 */
export interface IpcErrorInfo {
  code?: string
  message: string
}

export function ipcErrorInfo(err: unknown): IpcErrorInfo {
  const raw = err instanceof Error ? err.message : String(err)
  const unwrapped = raw.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
  const match = /^([a-z][a-z0-9-]+):\s+(.+)$/.exec(unwrapped)
  return match ? { code: match[1], message: match[2] } : { message: unwrapped }
}

export function ipcErrorMessage(err: unknown): string {
  return ipcErrorInfo(err).message
}
