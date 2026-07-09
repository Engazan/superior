/**
 * Multi-line text goes through bracketed paste so TUI agents (Claude/Codex)
 * receive it as one paste instead of executing line by line.
 */
export function wrapForPty(text: string): string {
  return text.includes('\n') ? `\x1b[200~${text}\x1b[201~` : text
}

/** Insert `text` into a session's pty; `submit` also presses Enter. */
export function insertIntoTerminal(sessionId: string, text: string, submit: boolean): void {
  window.api.sendInput(sessionId, wrapForPty(text) + (submit ? '\r' : ''))
}

/**
 * Format an absolute path for insertion into an agent prompt: quoted when it
 * contains whitespace so the agent reads it as one path, with a trailing space
 * separating it from whatever the user types next. Used for pasted images.
 */
export function formatPathForPrompt(path: string): string {
  return (/\s/.test(path) ? `"${path}"` : path) + ' '
}
