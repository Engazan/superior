import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Integration, WorkspaceState } from '@shared/types'
import { dashboardDetail, dashboardList, dashboardProject, dashboardReviews } from './git-dashboard.service'
import { matchForgeProject } from './forge-project'

const mock = vi.hoisted(() => ({
  workspace: vi.fn<() => WorkspaceState>(),
  integrations: vi.fn<() => Integration[]>(),
  git: vi.fn(),
  fetch: vi.fn<typeof fetch>()
}))
vi.mock('electron', () => ({ app: {}, dialog: {}, safeStorage: {} }))
vi.mock('./workspace.service', () => ({ listWorkspaces: mock.workspace }))
vi.mock('./git-runner', () => ({ runGit: mock.git }))
vi.mock('./integrations.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('./integrations.service')>(),
  integrationCredentials: mock.integrations
}))

const folder = '/work/app'
const gitlab: Integration = {
  id: 'work', provider: 'gitlab', name: 'Work GitLab', baseUrl: 'https://git.test/forge', token: 'fixture'
}
const binding = { integrationId: gitlab.id, fullName: 'team/subgroup/app' }
const mine = { id: 11, username: 'dev' }
const other = { id: 12, username: 'teammate' }
const issue = (iid: number) => ({
  iid, title: `Issue ${iid}`, state: 'opened', web_url: `https://git.test/forge/team/subgroup/app/-/issues/${iid}`,
  description: 'Issue body', updated_at: '2026-08-01T12:00:00Z', author: other, assignees: [mine]
})
const mr = (iid: number, reviewers = [mine]) => ({
  ...issue(iid), title: `MR ${iid}`,
  web_url: `https://git.test/forge/team/subgroup/app/-/merge_requests/${iid}`, reviewers
})
const json = (payload: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(payload), { headers })
const pathOf = (input: Parameters<typeof fetch>[0]) => new URL(String(input))

beforeEach(() => {
  vi.stubGlobal('fetch', mock.fetch)
  mock.integrations.mockReturnValue([gitlab])
  mock.git.mockResolvedValue('git@git.test:forge/team/subgroup/app.git')
  mock.workspace.mockReturnValue({
    profiles: [], activeProfileId: 'profile', activeWorkspaceId: 'tree',
    folders: [{ path: folder, name: 'app', profileId: 'profile', lastOpenedAt: 0 }],
    workspaces: [{ id: 'tree', name: 'tree', createdAt: 0, folderPath: folder, worktreePath: '/work/tree' }]
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('dashboard project resolution', () => {
  it('matches a legacy origin with nested groups and a self-hosted base path', async () => {
    expect(await dashboardProject(folder)).toEqual({ ...binding, provider: 'gitlab', integrationName: 'Work GitLab' })
    expect(mock.git).toHaveBeenCalledWith(folder, ['config', '--get', 'remote.origin.url'])
    expect(await dashboardProject('/work/tree')).toBeNull()
    expect(mock.fetch).not.toHaveBeenCalled()
  })

  it('uses the selected integration for a saved clone, including worktrees via the registered folder', async () => {
    const state = mock.workspace()
    state.folders[0].gitIntegration = binding
    mock.workspace.mockReturnValue(state)
    mock.integrations.mockReturnValue([{ ...gitlab, id: 'alternate' }, gitlab])
    expect(await dashboardProject(folder)).toMatchObject(binding)
    mock.integrations.mockReturnValue([{ ...gitlab, id: 'alternate' }])
    expect(await dashboardProject(folder)).toBeNull()
    expect(await dashboardReviews(folder, binding)).toEqual({ error: 'unlinked' })
    expect(mock.fetch).not.toHaveBeenCalled()
  })

  it('leaves ambiguous and unrelated origins unlinked', () => {
    expect(matchForgeProject('https://git.test/forge/team/subgroup/app', [gitlab, { ...gitlab, id: 'alt' }])).toBeNull()
    expect(matchForgeProject('https://other.test/forge/team/subgroup/app', [gitlab])).toBeNull()
    expect(matchForgeProject('https://git.test/forge-other/team/subgroup/app', [gitlab])).toBeNull()
  })
})

describe('dashboard forge data', () => {
  it('paginates GitLab issues and filters open assignments for the authenticated account', async () => {
    mock.fetch.mockImplementation(async (input, options) => {
      const url = pathOf(input)
      expect(options?.redirect).toBe('error')
      expect(options?.headers).toMatchObject({ 'PRIVATE-TOKEN': 'fixture' })
      if (url.pathname.endsWith('/user')) return json(mine)
      expect(decodeURIComponent(url.pathname)).toBe('/forge/api/v4/projects/team/subgroup/app/issues')
      expect(url.searchParams.get('assignee_id')).toBe('11')
      expect(url.searchParams.get('state')).toBe('opened')
      if (url.searchParams.get('page') === '1') return json(
        [issue(1), { ...issue(2), assignees: [other] }, { ...issue(3), state: 'closed' }],
        { 'x-next-page': '2' }
      )
      return json([issue(4)], { 'x-next-page': '' })
    })
    const result = await dashboardList(folder, binding, { kind: 'issue', assignee: 'me', state: 'open' })
    if (!('data' in result)) throw new Error(result.error)
    expect(result.data.items.map((item) => item.id)).toEqual([1, 4])
    expect(result.data.items[0]).not.toHaveProperty('body')
    expect(result.data.truncated).toBe(false)
  })

  it('keeps review work separate from assignee work and counts only open pending reviews', async () => {
    mock.fetch.mockImplementation(async (input) => {
      const url = pathOf(input)
      if (url.pathname.endsWith('/user')) return json(mine)
      if (url.pathname.endsWith('/1/reviewers')) return json([{ user: mine, state: 'reviewed' }])
      if (url.pathname.endsWith('/2/reviewers')) return json([{ user: mine, state: 'unreviewed' }])
      expect(url.searchParams.get('reviewer_id')).toBe('11')
      return json([
        mr(1), { ...mr(2), assignees: [other] }, mr(3, [other]),
        { ...mr(4), state: 'merged' }, { ...mr(5), state: 'closed' }
      ])
    })
    const result = await dashboardReviews(folder, binding)
    if (!('data' in result)) throw new Error(result.error)
    expect(result.data.pendingCount).toBe(1)
    expect(result.data.items.map(({ item, state }) => [item.id, state])).toEqual([[2, 'pending'], [1, 'completed']])
  })

  it('reports unknown reviewer state without publishing a partial badge count', async () => {
    mock.fetch.mockImplementation(async (input) => {
      const url = pathOf(input)
      if (url.pathname.endsWith('/user')) return json(mine)
      if (url.pathname.endsWith('/reviewers')) return new Response(null, { status: 404 })
      return json([mr(1)])
    })
    expect(await dashboardReviews(folder, binding)).toMatchObject({
      data: { pendingCount: null, items: [{ state: 'unknown' }] }
    })
  })

  it('loads a detail with a validated web URL and honors forge errors', async () => {
    mock.fetch.mockResolvedValueOnce(json(issue(1)))
    expect(await dashboardDetail(folder, binding, 'issue', 1)).toMatchObject({
      data: { id: 1, body: 'Issue body', url: issue(1).web_url }
    })
    mock.fetch.mockResolvedValueOnce(json({ ...issue(1), web_url: 'javascript:alert(1)' }))
    expect(await dashboardDetail(folder, binding, 'issue', 1)).toEqual({ error: 'not-found' })
    mock.fetch.mockResolvedValueOnce(new Response(null, { status: 429 }))
    expect(await dashboardReviews(folder, binding)).toEqual({ error: 'rate-limited' })
  })

  it('uses qualifying GitLab approvals and keeps the merge request when approval rules are unavailable', async () => {
    const row = { ...mr(4), labels: ['feature', { name: 'release', color: 'abc123' }],
      detailed_merge_status: 'conflict', head_pipeline: { status: 'failed' }, has_conflicts: false,
      user_notes_count: 3, source_branch: 'feature', target_branch: 'main' }
    mock.fetch.mockResolvedValueOnce(json(row))
      .mockResolvedValueOnce(json({ approvals_required: 2, approvals_left: 1, approved_by: [mine, other] }))
    expect(await dashboardDetail(folder, binding, 'merge-request', 4)).toMatchObject({
      data: {
        approvals: { required: 2, remaining: 1 }, comments: 3, conflicts: true, pipeline: 'failed',
        labels: [{ name: 'feature' }, { name: 'release', color: '#abc123' }],
        sourceBranch: 'feature', targetBranch: 'main', reviewers: ['dev']
      }
    })
    expect(pathOf(mock.fetch.mock.calls[1][0]).pathname).toContain('/merge_requests/4/approvals')

    mock.fetch.mockResolvedValueOnce(json(row)).mockResolvedValueOnce(new Response(null, { status: 404 }))
    const result = await dashboardDetail(folder, binding, 'merge-request', 4)
    expect(result).toMatchObject({ data: { id: 4 } })
    if ('data' in result) expect(result.data.approvals).toBeUndefined()
  })

  it.each(['github', 'gitea'] as const)('uses direct reviewer requests and excludes PR rows from %s issues', async (provider) => {
    const integration = { ...gitlab, provider, baseUrl: provider === 'github' ? 'https://api.github.com' : 'https://git.test' }
    const project = { integrationId: integration.id, fullName: 'team/app' }
    mock.integrations.mockReturnValue([integration])
    mock.git.mockResolvedValue(provider === 'github' ? 'git@github.com:team/app.git' : 'ssh://git@git.test:2222/team/app.git')
    const pr = {
      number: 12, title: 'Open review', state: 'open', html_url: 'https://git.test/team/app/pull/12',
      requested_reviewers: [{ id: 11, login: 'dev' }]
    }
    mock.fetch.mockImplementation(async (input) => {
      const url = pathOf(input)
      if (url.pathname.endsWith('/user')) return json({ login: 'dev', id: 11 })
      if (url.pathname.endsWith('/pulls')) return json([pr], { 'x-next-page': '' })
      return json([{ ...pr, pull_request: { url: pr.html_url } }], { 'x-next-page': '' })
    })
    expect(await dashboardReviews(folder, project)).toMatchObject({ data: { pendingCount: 1 } })
    expect(await dashboardList(folder, project, { kind: 'issue', state: 'all', assignee: 'any' })).toEqual({
      data: { items: [], truncated: false }
    })
  })
})
