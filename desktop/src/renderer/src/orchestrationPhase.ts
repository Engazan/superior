import type { NativeChat } from '@shared/native-chat'

export type PhaseId = 'split' | 'build' | 'review' | 'merge'
export type PhaseState = 'done' | 'active' | 'pending'

export const PHASES: readonly PhaseId[] = ['split', 'build', 'review', 'merge']

const live = (status: NativeChat['status']): boolean => status === 'working' || status === 'waiting'

/**
 * Where a coordinator run stands, derived from real state only:
 * - split: the coordinator plans until it dispatches its first worker;
 * - build: at least one worker still works or waits;
 * - review: all workers finished and the coordinator works on their results;
 * - merge: the user's step — Superior never merges, pushes or deletes worktrees.
 */
export function orchestrationPhases(chat: Pick<NativeChat, 'status' | 'workers'>): Record<PhaseId, PhaseState> {
  const workers = chat.workers ?? []
  if (workers.length === 0) {
    return { split: live(chat.status) ? 'active' : 'pending', build: 'pending', review: 'pending', merge: 'pending' }
  }
  if (workers.some((w) => live(w.status))) {
    return { split: 'done', build: 'active', review: 'pending', merge: 'pending' }
  }
  if (live(chat.status)) {
    return { split: 'done', build: 'done', review: 'active', merge: 'pending' }
  }
  return { split: 'done', build: 'done', review: 'done', merge: 'active' }
}
