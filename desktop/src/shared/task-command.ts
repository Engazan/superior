function quoteArg(text: string, platform = 'darwin'): string {
  if (platform === 'win32') {
    // cmd.exe: double quotes; literal " doubled, trailing \ would eat the close quote.
    return `"${text.replace(/"/g, '""').replace(/\\$/, '\\\\')}"`
  }
  return `'${text.replace(/'/g, `'\\''`)}'`
}

function hasFlag(command: string, flag: string): boolean {
  return new RegExp(`(?:^|\\s)${flag}(?:\\s|$)`).test(command)
}

/**
 * Build a command that represents exactly one queue item. Claude and Codex
 * normally remain interactive after handling a prompt, so Tasks uses their
 * one-shot modes and then advances when the process exits.
 */
export function buildTaskCommand(
  command: string,
  prompt: string,
  platform = 'darwin'
): string {
  const trimmed = command.trim()
  const quotedPrompt = quoteArg(prompt, platform)

  if (/^codex(?:\s|$)/.test(trimmed) && !/^codex\s+exec(?:\s|$)/.test(trimmed)) {
    return `codex exec${trimmed.slice('codex'.length)} ${quotedPrompt}`.trim()
  }

  if (/^claude(?:\s|$)/.test(trimmed) && !hasFlag(trimmed, '-p') && !hasFlag(trimmed, '--print')) {
    return `${trimmed} --print ${quotedPrompt}`.trim()
  }

  return `${trimmed} ${quotedPrompt}`.trim()
}

