/** Project-local preferences, stored by Superior rather than executed from a checkout. */
export interface WorktreeSetupConfig {
  commands: string[]
  copyFiles: string[]
}

export interface WorktreeSetupState {
  status: 'pending' | 'running' | 'ready' | 'failed'
  step: string
  output: string
  error?: string
  startedAt?: number
  finishedAt?: number
}

export interface WorktreeSetupSnapshot {
  config: WorktreeSetupConfig
  state: WorktreeSetupState | null
}

export function validateSetupConfig(value: unknown): WorktreeSetupConfig {
  if (!value || typeof value !== 'object') throw new Error('Invalid setup configuration.')
  const { commands, copyFiles } = value as WorktreeSetupConfig
  if (!Array.isArray(commands) || commands.length > 30 ||
      commands.some(c => typeof c !== 'string' || !c.trim() || c.length > 16000 || c.includes('\0')) ||
      !Array.isArray(copyFiles) || copyFiles.length > 100 ||
      copyFiles.some(p => typeof p !== 'string' || !p.trim() || p.length > 1024 ||
        /[\\:\x00-\x1f]/.test(p) || p.startsWith('/') ||
        p.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) || part.toLowerCase() === '.git'))) {
    throw new Error('Use up to 30 commands and 100 relative file paths without .git, .. or symlinks.')
  }
  return { commands: commands.map(c => c.trim()), copyFiles: [...new Set(copyFiles)] }
}
