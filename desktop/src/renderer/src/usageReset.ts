import type { AccountUsage, UsageWindow } from './types'

/** A new server-reported quota period, never a guessed reset from a countdown. */
export function resetWindows(previous: AccountUsage | undefined, current: AccountUsage): UsageWindow[] {
  if (!previous || previous.status !== 'ready' || current.status !== 'ready' ||
    current.updatedAt <= previous.updatedAt || previous.authFingerprint !== current.authFingerprint) return []
  return current.windows.filter((window) => {
    const old = previous.windows.find((item) => item.id === window.id)
    return old && old.resetsAt !== null && window.resetsAt !== null && old.resetsAt <= current.updatedAt &&
      old.resetsAt > previous.updatedAt && window.resetsAt > old.resetsAt && window.resetsAt > current.updatedAt
  })
}
