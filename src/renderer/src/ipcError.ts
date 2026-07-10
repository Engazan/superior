/**
 * Electron rewraps a rejected ipcRenderer.invoke as
 * `Error invoking remote method '<channel>': Error: <original message>`.
 * Strip that envelope so user-facing messages — and stable error-code matching
 * (e.g. WORKTREE_ERROR) — see the original text.
 */
export function ipcErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}
