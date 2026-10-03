import { dialog, safeStorage } from 'electron'
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

/** On-disk shape: the token is stored OS-keychain-encrypted (`tokenEnc`) when
 * the platform supports it; plaintext `token` remains only as the fallback for
 * systems without a keyring, and as the pre-encryption legacy format. */
interface StoredIntegration extends Omit<Integration, 'token'> {
  token?: string
  tokenEnc?: string
}

function isStoredIntegration(v: unknown): v is StoredIntegration {
  const o = v as Partial<StoredIntegration>
  return (
    !!o &&
    typeof o.id === 'string' &&
    PROVIDERS.includes(o.provider as IntegrationProvider) &&
    typeof o.name === 'string' &&
    typeof o.baseUrl === 'string' &&
    (typeof o.token === 'string' || typeof o.tokenEnc === 'string')
  )
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function decryptToken(row: StoredIntegration): string {
  if (row.tokenEnc) {
    try {
      return safeStorage.decryptString(Buffer.from(row.tokenEnc, 'base64'))
    } catch {
      return '' // keychain unavailable — surfaces as 'unauthorized' in the UI
    }
  }
  return row.token ?? ''
}

function toStored(i: Integration): StoredIntegration {
  const { token, ...rest } = i
  if (token && canEncrypt()) {
    return { ...rest, tokenEnc: safeStorage.encryptString(token).toString('base64') }
  }
  return { ...rest, token }
}

function read(): IntegrationsState {
  const rows =
    readJsonFile<StoredIntegration[] | null>(storeFile(), null, (p) => {
      const obj = p as { integrations?: unknown[] }
      return obj && Array.isArray(obj.integrations)
        ? obj.integrations.filter(isStoredIntegration)
        : null
    }) ?? []
  const state: IntegrationsState = {
    integrations: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      name: r.name,
      baseUrl: r.baseUrl,
      token: decryptToken(r)
    }))
  }
  // One-time upgrade: a store carrying plaintext tokens is rewritten encrypted.
  if (canEncrypt() && rows.some((r) => r.token)) save(state)
  return state
}

function save(state: IntegrationsState): void {
  writeJsonFile(storeFile(), { integrations: state.integrations.map(toStored) }, 'integrations')
}

function rendererState(state: IntegrationsState): IntegrationsState {
  return {
    integrations: state.integrations.map((integration) => ({
      ...integration,
      token: '',
      hasToken: integration.token.length > 0
    }))
  }
}

export function listIntegrations(): IntegrationsState {
  return rendererState(read())
}

/** Upsert an integration by id (adds when new, replaces when existing). */
export function saveIntegration(integration: Integration): IntegrationsState {
  const state = read()
  const existing = integration.id
    ? state.integrations.find((item) => item.id === integration.id)
    : undefined
  const token = integration.token.trim() || existing?.token || ''
  if (!token) throw new Error('An access token is required.')
  const clean: Integration = {
    id: integration.id || randomUUID(),
    provider: PROVIDERS.includes(integration.provider) ? integration.provider : 'gitea',
    name: integration.name.trim(),
    baseUrl: integration.baseUrl.trim().replace(/\/+$/, ''),
    token
  }
  const idx = state.integrations.findIndex((i) => i.id === clean.id)
  if (idx >= 0) state.integrations[idx] = clean
  else state.integrations.push(clean)
  save(state)
  return rendererState(state)
}

export function deleteIntegration(id: string): IntegrationsState {
  const state = read()
  state.integrations = state.integrations.filter((i) => i.id !== id)
  save(state)
  return rendererState(state)
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

/**
 * Basic-auth header for git-over-HTTP, wire-identical to the user:pass form
 * each forge documents (token as username for GitHub/Gitea, oauth2:token for
 * GitLab) — but delivered via environment config instead of the URL, so the
 * token never appears in argv, .git/config or git's error output.
 */
function cloneAuthHeader(integration: Integration): string {
  const cred =
    integration.provider === 'gitlab' ? `oauth2:${integration.token}` : `${integration.token}:`
  return `Authorization: Basic ${Buffer.from(cred).toString('base64')}`
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
 * result as a folder. The token travels via ephemeral git config from the
 * environment (git ≥ 2.31) — never in argv or the URL — so nothing
 * credentialed can land in `ps` output, .git/config or error text.
 */
export async function cloneRepository(args: CloneArgs): Promise<CloneResult> {
  const integration = read().integrations.find((i) => i.id === args.integrationId)
  if (!integration) return { error: 'unknown-integration' }
  // http(s) only: a crafted value like `--upload-pack=<cmd>` or an exotic
  // scheme must never reach git as anything but a URL (see also `--` below).
  if (!args.cloneUrl || !/^https?:\/\//i.test(args.cloneUrl)) return { error: 'invalid-repo' }

  const picked = await dialog.showOpenDialog({
    title: 'Choose where to clone',
    properties: ['openDirectory', 'createDirectory']
  })
  if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }
  const parent = picked.filePaths[0]

  const repoName =
    path.basename((args.fullName.split('/').pop() || 'repo').replace(/\.git$/, '').trim()) || 'repo'
  const dest = path.resolve(parent, repoName)
  // A crafted fullName ('..', 'a\..\b') must not escape the picked parent.
  if (repoName === '.' || repoName === '..' || path.dirname(dest) !== path.resolve(parent)) {
    return { error: 'invalid-repo' }
  }
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    return { error: 'dest-exists' }
  }

  try {
    await execFileAsync('git', ['clone', '--', args.cloneUrl, dest], {
      timeout: 300_000,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // fail fast on bad auth, never prompt
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraHeader',
        GIT_CONFIG_VALUE_0: cloneAuthHeader(integration)
      }
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

  return { state: addFolderByPath(dest) }
}
