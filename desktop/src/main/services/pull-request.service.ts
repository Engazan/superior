import { execFile } from 'child_process'
import { promisify } from 'util'
import { parseChecks, type PullRequestState } from '@shared/pull-request'
import { isWithinWorkspaceFolder } from './workspace.service'
import { runGit } from './git-runner'
const execute = promisify(execFile)
const cache = new Map<string, PullRequestState>()
export async function getPullRequest(folder: string, refresh = false): Promise<PullRequestState> {
  const fetchedAt = Date.now()
  if (!isWithinWorkspaceFolder(folder)) throw new Error('Invalid workspace folder.')
  try {
    const [branch, localHead] = await Promise.all([runGit(folder, ['symbolic-ref', '--quiet', '--short', 'HEAD']), runGit(folder, ['rev-parse', 'HEAD'])])
    const key = JSON.stringify([folder, branch, localHead])
    const prior = cache.get(key)
    if (!refresh && prior && fetchedAt - prior.fetchedAt < 30_000) return prior
    const { stdout } = await execute('gh', ['pr', 'view', '--json', 'number,title,url,state,reviewDecision,headRefOid,statusCheckRollup'], {
      cwd: folder, encoding: 'utf8', timeout: 15_000, maxBuffer: 2_000_000, windowsHide: true,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' }
    })
    const raw = JSON.parse(stdout)
    const [newBranch, newHead] = await Promise.all([runGit(folder, ['symbolic-ref', '--quiet', '--short', 'HEAD']), runGit(folder, ['rev-parse', 'HEAD'])])
    if (newBranch !== branch || newHead !== localHead) throw new Error('Branch changed during refresh. Refresh again.')
    if (!Number.isInteger(raw.number) || typeof raw.url !== 'string' || !raw.url.startsWith('https://')) throw new Error('Invalid GitHub response.')
    const state: PullRequestState = { fetchedAt, branch, localHead, number: raw.number, title: String(raw.title), url: raw.url,
      state: String(raw.state), review: String(raw.reviewDecision || ''), head: String(raw.headRefOid), checks: parseChecks(raw.statusCheckRollup) }
    if (cache.size >= 100) cache.clear()
    cache.set(key, state)
    return state
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stderr?: string }
    return { fetchedAt, checks: [], error: e.code === 'ENOENT' ? 'GitHub CLI (gh) is not available. Install it and sign in with gh auth login.' : (e.stderr?.trim() || e.message).slice(0, 2000) }
  }
}
