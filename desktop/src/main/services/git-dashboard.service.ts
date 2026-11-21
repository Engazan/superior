import type {
  DashboardDetail, DashboardError, DashboardFilter, DashboardKind, DashboardList,
  DashboardProject, DashboardResult, DashboardReviews, DashboardReviewState, GitProjectBinding
} from '@shared/git-dashboard'
import type { Integration } from '@shared/types'
import { listWorkspaces } from './workspace.service'
import { apiBase, authHeaders, integrationCredentials } from './integrations.service'
import { runGit } from './git-runner'
import { matchForgeProject, repositoryName } from './forge-project'

type RecordValue = Record<string, unknown>
type Project = { integration: Integration; fullName: string }
type Account = { id: string; name: string }

const PAGE_SIZE = 50
const MAX_PAGES = 40

class DashboardFailure extends Error {
  constructor(readonly code: DashboardError) {
    super(code)
  }
}

const object = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const string = (value: unknown): string => typeof value === 'string' ? value : ''
const rows = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(object) : []
const account = (row: RecordValue): Account => ({
  id: typeof row.id === 'number' || typeof row.id === 'string' ? String(row.id) : '',
  name: string(row.login) || string(row.username)
})
const sameAccount = (row: RecordValue, current: Account): boolean => {
  const user = account(row)
  return user.id && current.id ? user.id === current.id
    : !!user.name && user.name.toLowerCase() === current.name.toLowerCase()
}

async function resolveProject(folderPath: string): Promise<Project | null> {
  const state = listWorkspaces()
  const folder = state.folders.find((item) => item.path === folderPath && item.profileId === state.activeProfileId)
  if (!folder || folder.kind === 'remote') return null
  const integrations = integrationCredentials()
  if (integrations.length === 0) return null
  const origin = await runGit(folder.path, ['config', '--get', 'remote.origin.url']).catch(() => '')
  return matchForgeProject(origin, integrations, folder.gitIntegration)
}

export async function dashboardProject(folderPath: string): Promise<DashboardProject | null> {
  const match = await resolveProject(folderPath)
  if (!match) return null
  const { integration, fullName } = match
  return { integrationId: integration.id, fullName, provider: integration.provider, integrationName: integration.name }
}

function safeWebUrl(raw: unknown): string {
  try {
    const url = new URL(string(raw))
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

function normalize(row: RecordValue, kind: DashboardKind): DashboardDetail | null {
  const id = row.iid ?? row.number
  const url = safeWebUrl(row.web_url ?? row.html_url)
  const title = string(row.title)
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !url || !title) return null
  const state = string(row.state)
  const assignees = Array.isArray(row.assignees) ? rows(row.assignees) : [object(row.assignee)]
  return {
    id, kind, title, url,
    state: state === 'merged' || row.merged === true || !!row.merged_at ? 'merged'
      : state === 'open' || state === 'opened' ? 'open' : 'closed',
    updatedAt: string(row.updated_at),
    assignees: assignees.map((user) => account(user).name).filter(Boolean),
    author: account(object(row.author ?? row.user)).name,
    body: string(row.description ?? row.body),
    sourceBranch: string(row.source_branch ?? object(row.head).ref) || undefined,
    targetBranch: string(row.target_branch ?? object(row.base).ref) || undefined
  }
}

function summary(item: DashboardDetail) {
  const { body: _body, sourceBranch: _source, targetBranch: _target, ...rest } = item
  return rest
}

class ForgeDashboard {
  readonly gitlab: boolean
  private readonly base: string
  private readonly repo: string
  private readonly deadline = Date.now() + 45_000

  constructor(private readonly project: Project) {
    const { integration, fullName } = project
    this.gitlab = integration.provider === 'gitlab'
    this.base = apiBase(integration.provider, integration.baseUrl)
    const base = new URL(this.base)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash ||
        !repositoryName(fullName) || (!this.gitlab && fullName.split('/').length !== 2)) {
      throw new DashboardFailure('unlinked')
    }
    this.repo = this.gitlab ? `/projects/${encodeURIComponent(fullName)}`
      : `/repos/${fullName.split('/').map(encodeURIComponent).join('/')}`
  }

  private path(kind: DashboardKind): string {
    return `${this.repo}/${kind === 'issue' ? 'issues' : this.gitlab ? 'merge_requests' : 'pulls'}`
  }

  private async get(path: string, params: Record<string, string> = {}) {
    const { provider, token } = this.project.integration
    if (!token) throw new DashboardFailure('unauthorized')
    const url = new URL(this.base + path)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    // Never forward a forge token on a redirect, including to another path on a shared host.
    const remaining = this.deadline - Date.now()
    if (remaining <= 0) throw new DashboardFailure('unavailable')
    const response = await fetch(url, {
      headers: authHeaders(provider, token), redirect: 'error',
      signal: AbortSignal.timeout(Math.min(10_000, remaining))
    })
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
      throw new DashboardFailure('rate-limited')
    }
    if (response.status === 401 || response.status === 403) throw new DashboardFailure('unauthorized')
    if (response.status === 404) throw new DashboardFailure('not-found')
    if (!response.ok) throw new DashboardFailure('unavailable')
    const data: unknown = await response.json()
    return { data, headers: response.headers }
  }

  private async paged(path: string, params: Record<string, string>, accept: (row: RecordValue) => void): Promise<boolean> {
    const gitea = this.project.integration.provider === 'gitea'
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, headers } = await this.get(path, { ...params, [gitea ? 'limit' : 'per_page']: String(PAGE_SIZE), page: String(page) })
      if (!Array.isArray(data)) throw new DashboardFailure('unavailable')
      rows(data).forEach(accept)
      const link = headers.get('link')
      const next = headers.get('x-next-page')
      if (data.length === 0 || next === '' || (link !== null && !/rel="next"/.test(link))) return false
      // Some self-hosted forges cap page sizes without returning pagination headers.
      if (!gitea && next === null && link === null && data.length < PAGE_SIZE) return false
    }
    return true
  }

  private async currentUser(): Promise<Account> {
    const { data } = await this.get('/user')
    const user = account(object(data))
    if (!user.id || !user.name) throw new DashboardFailure('unavailable')
    return user
  }

  private stateParams(state: DashboardFilter['state']): Record<string, string> {
    return { state: state === 'all' ? 'all' : this.gitlab ? 'opened' : 'open' }
  }

  async list(filter: DashboardFilter): Promise<DashboardList> {
    const me = filter.assignee === 'me' ? await this.currentUser() : null
    const params = this.stateParams(filter.state)
    if (this.gitlab) {
      params.scope = 'all'
      if (me) params.assignee_id = me.id
    }
    if (me && this.project.integration.provider === 'github' && filter.kind === 'issue') params.assignee = me.name
    if (filter.kind === 'issue' && this.project.integration.provider === 'gitea') params.type = 'issues'

    const items = new Map<number, ReturnType<typeof summary>>()
    const truncated = await this.paged(this.path(filter.kind), params, (row) => {
      if (filter.kind === 'issue' && (row.pull_request || row.pull_request_meta)) return
      if (me && ![object(row.assignee), ...rows(row.assignees)].some((user) => sameAccount(user, me))) return
      const item = normalize(row, filter.kind)
      if (item && (filter.state === 'all' || item.state === 'open')) items.set(item.id, summary(item))
    })
    return { items: [...items.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), truncated }
  }

  async detail(kind: DashboardKind, id: number): Promise<DashboardDetail> {
    const { data } = await this.get(`${this.path(kind)}/${id}`)
    const row = object(data)
    const detail = normalize(row, kind)
    if (!detail || (kind === 'issue' && (row.pull_request || row.pull_request_meta))) throw new DashboardFailure('not-found')
    return detail
  }

  private async reviewerState(id: number, me: Account): Promise<DashboardReviewState> {
    try {
      const { data } = await this.get(`${this.path('merge-request')}/${id}/reviewers`)
      const reviewer = rows(data).find((entry) => sameAccount(object(entry.user), me))
      switch (reviewer?.state) {
        case 'unreviewed':
        case 'review_started': return 'pending'
        case 'reviewed':
        case 'approved':
        case 'requested_changes':
        case 'unapproved': return 'completed'
        default: return 'unknown'
      }
    } catch (error) {
      if (error instanceof DashboardFailure && (error.code === 'unauthorized' || error.code === 'rate-limited')) throw error
      return 'unknown'
    }
  }

  async reviews(): Promise<DashboardReviews> {
    const me = await this.currentUser()
    const params = this.stateParams('open')
    if (this.gitlab) {
      params.reviewer_id = me.id
      params.scope = 'all'
    }
    const candidates = new Map<number, ReturnType<typeof summary>>()
    let incomplete = false
    const truncated = await this.paged(this.path('merge-request'), params, (row) => {
      const item = normalize(row, 'merge-request')
      if (!item || item.state !== 'open') return
      const reviewers = this.gitlab ? row.reviewers : row.requested_reviewers
      if (!Array.isArray(reviewers)) {
        incomplete = true
        if (this.gitlab) candidates.set(item.id, summary(item))
        return
      }
      if (rows(reviewers).some((user) => sameAccount(user, me))) candidates.set(item.id, summary(item))
    })

    const items: DashboardReviews['items'] = []
    const candidatesList = [...candidates.values()]
    for (let index = 0; index < candidatesList.length; index += 4) {
      const batch = candidatesList.slice(index, index + 4)
      items.push(...await Promise.all(batch.map(async (item) => ({
        item, state: this.gitlab ? await this.reviewerState(item.id, me) : 'pending' as const
      }))))
    }
    const priority = { pending: 0, unknown: 1, completed: 2 }
    items.sort((a, b) => priority[a.state] - priority[b.state] || b.item.updatedAt.localeCompare(a.item.updatedAt))
    const pendingCount = truncated || incomplete || items.some((row) => row.state === 'unknown')
      ? null : items.filter((row) => row.state === 'pending').length
    return { items, pendingCount }
  }
}

async function withProject<T>(folderPath: string, binding: GitProjectBinding, read: (forge: ForgeDashboard) => Promise<T>): Promise<DashboardResult<T>> {
  try {
    const project = await resolveProject(folderPath)
    if (!project || project.integration.id !== binding.integrationId || project.fullName !== binding.fullName) {
      return { error: 'unlinked' }
    }
    return { data: await read(new ForgeDashboard(project)) }
  } catch (error) {
    return { error: error instanceof DashboardFailure ? error.code : 'unavailable' }
  }
}

export const dashboardList = (folder: string, binding: GitProjectBinding, filter: DashboardFilter) =>
  withProject(folder, binding, (forge) => forge.list(filter))

export const dashboardReviews = (folder: string, binding: GitProjectBinding) =>
  withProject(folder, binding, (forge) => forge.reviews())

export const dashboardDetail = (folder: string, binding: GitProjectBinding, kind: DashboardKind, id: number) =>
  withProject(folder, binding, (forge) => forge.detail(kind, id))
