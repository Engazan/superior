import { daemonClient } from './daemonClient'
import { canonicalPath } from './path.service'
import type { SendReviewArgs } from '@shared/types'

/** A review is an explicit batch to one terminal, never a broadcast. */
export async function sendReview(args: SendReviewArgs): Promise<void> {
  if (!args || typeof args.sessionId !== 'string' || !args.sessionId ||
    typeof args.workspaceId !== 'string' || !args.workspaceId ||
    typeof args.folderPath !== 'string' || !args.folderPath ||
    typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 1_000_000 ||
    /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(args.prompt)) {
    throw new Error('Invalid review request.')
  }
  const session = (await daemonClient.list()).find((item) => item.id === args.sessionId)
  if (!session || session.status !== 'running' || !session.meta.command.trim() ||
    session.meta.workspaceId !== args.workspaceId || session.meta.launchTarget?.kind === 'remote' ||
    canonicalPath(session.meta.cwd) !== canonicalPath(args.folderPath)) {
    throw new Error('The review target is no longer available in this workspace.')
  }
  // Bracketed paste keeps all comments in a single agent prompt, followed by Enter.
  await daemonClient.inputChecked(session.id, `\x1b[200~${args.prompt}\x1b[201~\r`)
}
