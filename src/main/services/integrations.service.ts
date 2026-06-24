import { dialog } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type {
  CloneArgs,
  CloneResult,
  Integration,
  IntegrationDraft,
  IntegrationProvider,
  IntegrationsState,
  IntegrationTestResult,
  RemoteRepo,
  RepoListResult
} from '@shared/types'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'
import { addFolderByPath } from './workspace.service'

const execFileAsync = promisify(execFile)

const PROVIDERS: IntegrationProvider[] = ['github', 'gitlab', 'gitea']

function storeFile(): string {
  return userDataFile('integrations.json')
}

function isIntegration(v: unknown): v is Integration {
  const o = v as Partial<Integration>
  return (
    !!o &&
    typeof o.id === 'string' &&
    PROVIDERS.includes(o.provider as IntegrationProvider) &&
    typeof o.name === 'string' &&
    typeof o.baseUrl === 'string' &&
    typeof o.token === 'string'
  )
}

function read(): IntegrationsState {
  const parsed = readJsonFile<IntegrationsState | null>(storeFile(), null, (p) => {
    const obj = p as Partial<IntegrationsState>
    return obj && Array.isArray(obj.integrations)
      ? { integrations: obj.integrations.filter(isIntegration) }
      : null
  })
  return parsed ?? { integrations: [] }
}

function save(state: IntegrationsState): void {
  writeJsonFile(storeFile(), state, 'integrations')
}

export function listIntegrations(): IntegrationsState {
  return read()
}

/** Upsert an integration by id (adds when new, replaces when existing). */
export function saveIntegration(integration: Integration): IntegrationsState {
  const state = read()
  const clean: Integration = {
    id: integration.id || randomUUID(),
    provider: PROVIDERS.includes(integration.provider) ? integration.provider : 'gitea',
    name: integration.name.trim(),
    baseUrl: integration.baseUrl.trim().replace(/\/+$/, ''),
    token: integration.token.trim()
  }
  const idx = state.integrations.findIndex((i) => i.id === clean.id)
  if (idx >= 0) state.integrations[idx] = clean
  else state.integrations.push(clean)
  save(state)
  return state
}

export function deleteIntegration(id: string): IntegrationsState {
  const state = read()
  state.integrations = state.integrations.filter((i) => i.id !== id)
  save(state)
  return state
}

/**
 * The REST API root for a provider/baseUrl pair. github.com resolves to its
 * public API host; a self-hosted GitHub uses /api/v3, GitLab /api/v4, Gitea
 * /api/v1.
 */
function apiBase(provider: IntegrationProvider, baseUrl: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '')
  switch (provider) {
    case 'github':
      if (!url || /^https?:\/\/(www\.)?github\.com$/i.test(url)) return 'https://api.github.com'
      return `${url}/api/v3`
    case 'gitlab':
      return `${url || 'https://gitlab.com'}/api/v4`
    case 'gitea':
      return `${url}/api/v1`
  }
}

/** Auth + accept headers for a provider's API. */
function authHeaders(provider: IntegrationProvider, token: string): Record<string, string> {
  switch (provider) {
    case 'github':
      return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Superior'
      }
    case 'gitlab':
      return { 'PRIVATE-TOKEN': token, Accept: 'application/json', 'User-Agent': 'Superior' }
    case 'gitea':
      return { Authorization: `token ${token}`, Accept: 'application/json', 'User-Agent': 'Superior' }
  }
}

/** GET a URL with a 10s timeout; rejects like fetch (caller maps to a code). */
async function apiGet(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    return await fetch(url, { headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Map a fetch/network failure to a stable, localizable error code. */
function networkError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string } }
  if (e?.name === 'AbortError') return 'timeout'
  const code = e?.cause?.code
  if (code === 'ECONNREFUSED') return 'refused'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'not-found'
  return 'network'
}

/** Validate a connection by hitting the provider's "current user" endpoint. */
export async function testConnection(draft: IntegrationDraft): Promise<IntegrationTestResult> {
  const provider = PROVIDERS.includes(draft.provider) ? draft.provider : 'gitea'
  const token = draft.token.trim()
  const baseUrl = draft.baseUrl.trim()
  if (!token) return { ok: false, error: 'missing-token' }
  if (provider !== 'github' && !baseUrl) return { ok: false, error: 'missing-url' }
  try {
    const res = await apiGet(`${apiBase(provider, baseUrl)}/user`, authHeaders(provider, token))
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'unauthorized' }
    if (!res.ok) return { ok: false, error: `http-${res.status}` }
    const data = (await res.json()) as { login?: string; username?: string }
    return { ok: true, username: data.login || data.username || '' }
  } catch (err) {
    return { ok: false, error: networkError(err) }
  }
}

/** The "list my repositories" endpoint for a provider. */
function reposUrl(provider: IntegrationProvider, base: string): string {
  switch (provider) {
    case 'github':
      return `${base}/user/repos?per_page=100&sort=updated`
    case 'gitlab':
      return `${base}/projects?membership=true&per_page=100&simple=true&order_by=last_activity_at`
    case 'gitea':
      return `${base}/user/repos?limit=50&page=1`
  }
}

/** Loose shape of a repo object across the three forges. */
interface RawRepo {
  id?: number | string
  name?: string
  full_name?: string
  path?: string
  path_with_namespace?: string
  description?: string | null
  clone_url?: string
  http_url_to_repo?: string
  private?: boolean
  visibility?: string
  default_branch?: string
}

function normalizeRepos(provider: IntegrationProvider, data: unknown): RemoteRepo[] {
  if (!Array.isArray(data)) return []
  const rows = data as RawRepo[]
  if (provider === 'gitlab') {
    return rows
      .map((r) => ({
        id: String(r.id ?? ''),
        name: r.path ?? r.name ?? '',
        fullName: r.path_with_namespace ?? r.name ?? '',
        description: r.description ?? '',
        cloneUrl: r.http_url_to_repo ?? '',
        private: r.visibility ? r.visibility !== 'public' : true,
        defaultBranch: r.default_branch ?? 'main'
      }))
      .filter((r) => r.cloneUrl)
  }
  // GitHub and Gitea share the same field names.
  return rows
    .map((r) => ({
      id: String(r.id ?? ''),
      name: r.name ?? '',
      fullName: r.full_name ?? r.name ?? '',
      description: r.description ?? '',
      cloneUrl: r.clone_url ?? '',
      private: !!r.private,
      defaultBranch: r.default_branch ?? 'main'
    }))
    .filter((r) => r.cloneUrl)
}

/** Fetch the repositories the integration's token can access. */
export async function listRepos(integrationId: string): Promise<RepoListResult> {
  const integration = read().integrations.find((i) => i.id === integrationId)
  if (!integration) return { repos: [], error: 'unknown-integration' }
  try {
    const base = apiBase(integration.provider, integration.baseUrl)
    const res = await apiGet(reposUrl(integration.provider, base), authHeaders(integration.provider, integration.token))
    if (res.status === 401 || res.status === 403) return { repos: [], error: 'unauthorized' }
    if (!res.ok) return { repos: [], error: `http-${res.status}` }
    const data = (await res.json()) as unknown
    const repos = normalizeRepos(integration.provider, data)
    repos.sort((a, b) => a.fullName.localeCompare(b.fullName))
    return { repos }
  } catch (err) {
    return { repos: [], error: networkError(err) }
  }
}

/** Embed the token into a clone URL so a private repo can be cloned non-interactively. */
function authedCloneUrl(integration: Integration, cloneUrl: string): string {
  try {
    const u = new URL(cloneUrl)
    if (integration.provider === 'gitlab') {
      u.username = 'oauth2'
      u.password = integration.token
    } else {
      u.username = integration.token
      u.password = ''
    }
    return u.toString()
  } catch {
    return cloneUrl
  }
}

/** Render a git clone failure into a code/message, redacting any leaked token. */
function cloneErrorMessage(err: unknown): string {
  const e = err as NodeJS.ErrnoException & { stderr?: string }
  if (e.code === 'ENOENT') return 'git-missing'
  const msg = (e.stderr || '').toString().trim() || e.message || 'clone-failed'
  // Strip "//user:token@" credentials git may echo back in its error text.
  return msg.replace(/\/\/[^@\s/]+@/g, '//***@')
}

/**
 * Clone a forge repo into a user-picked parent directory and register the
 * result as a folder. The token is used for the clone but then stripped from
 * the stored remote so it never lands in .git/config.
 */
export async function cloneRepository(args: CloneArgs): Promise<CloneResult> {
  const integration = read().integrations.find((i) => i.id === args.integrationId)
  if (!integration) return { error: 'unknown-integration' }
  if (!args.cloneUrl) return { error: 'invalid-repo' }

  const picked = await dialog.showOpenDialog({
    title: 'Choose where to clone',
    properties: ['openDirectory', 'createDirectory']
  })
  if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }
  const parent = picked.filePaths[0]

  const repoName = (args.fullName.split('/').pop() || 'repo').replace(/\.git$/, '')
  const dest = path.join(parent, repoName)
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    return { error: 'dest-exists' }
  }

  try {
    await execFileAsync('git', ['clone', authedCloneUrl(integration, args.cloneUrl), dest], {
      timeout: 300_000,
      windowsHide: true
    })
  } catch (err) {
    // Best-effort cleanup of a partial clone so a retry isn't blocked.
    try {
      fs.rmSync(dest, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    return { error: cloneErrorMessage(err) }
  }

  // Replace the credentialed remote with the clean URL so no token is persisted.
  try {
    await execFileAsync('git', ['-C', dest, 'remote', 'set-url', 'origin', args.cloneUrl], {
      timeout: 5000,
      windowsHide: true
    })
  } catch {
    /* non-fatal: the clone already succeeded */
  }

  return { state: addFolderByPath(dest) }
}
