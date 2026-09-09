import { net } from 'electron'
import { readFile, stat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { AccountUsage, CodexResetCredits, UsageResetRequest, UsageResetOutcome, UsageProfile, UsageWindow } from '@shared/types'
import { homeDir } from './claude-paths'
import { listCustomMemoryPresets } from './custom-memory.service'

type Json = Record<string, unknown>
function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
}

export function listUsageProfiles(): UsageProfile[] {
  return [
    { id: 'claude:default', provider: 'claude', name: 'Claude', directoryPath: join(homeDir(), '.claude') },
    { id: 'codex:default', provider: 'codex', name: 'Codex', directoryPath: join(homeDir(), '.codex') },
    ...listCustomMemoryPresets().map((preset): UsageProfile => ({
      id: `custom:${preset.id}`,
      provider: preset.provider,
      name: `${preset.provider === 'claude' ? 'Claude' : 'Codex'} · ${preset.name}`,
      directoryPath: preset.directoryPath
    }))
  ]
}

function timestamp(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN
  const ms = Number.isFinite(numeric) ? numeric < 1e12 ? numeric * 1000 : numeric : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

const creditsUrl = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
function fingerprint(auth: Json): string {
  return createHash('sha256').update(JSON.stringify([auth.account_id, auth.access_token])).digest('hex')
}

export function parseResetCredits(payload: unknown): CodexResetCredits | null {
  const data = record(payload)
  const credits = Array.isArray(data.credits) ? data.credits.filter((item) =>
    record(item).status === 'available').map((item) => ({ expiresAt: timestamp(record(item).expires_at) })) : null
  const count = data.available_count
  if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) return { availableCount: count, credits }
  return credits ? { availableCount: credits.length, credits } : null
}

async function fetchCredits(headers: Record<string, string>): Promise<CodexResetCredits | null> {
  try {
    const response = await net.fetch(creditsUrl, { headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) { await response.body?.cancel(); return null }
    return parseResetCredits(await response.json())
  } catch { return null }
}

function windowValue(id: string, label: string, percent: unknown, reset: unknown): UsageWindow[] {
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0) return []
  return [{ id, label, usedPercent: Math.min(100, percent), resetsAt: timestamp(reset) }]
}

/** Normalize provider payloads without treating absent limits as zero usage. */
export function parseUsageWindows(provider: UsageProfile['provider'], payload: unknown): UsageWindow[] {
  const data = record(payload)
  if (provider === 'claude') {
    return Object.entries(data).flatMap(([id, value]) => {
      if (id !== 'five_hour' && !id.startsWith('seven_day')) return []
      const raw = record(value)
      const label = id === 'five_hour' ? '5h' : id === 'seven_day' ? '7d' : `7d · ${id.slice(10)}`
      return windowValue(id, label, raw.utilization ?? raw.used_percentage, raw.resets_at)
    })
  }
  const limits = record(data.rate_limit)
  return ['primary_window', 'secondary_window'].flatMap((id) => {
    const raw = record(limits[id])
    const seconds = raw.limit_window_seconds
    const label = typeof seconds === 'number' && seconds > 0
      ? seconds % 86400 === 0 ? `${seconds / 86400}d` : `${Math.round(seconds / 3600 * 10) / 10}h`
      : id === 'primary_window' ? '5h' : '7d'
    return windowValue(id, label, raw.used_percent, raw.reset_at)
  })
}

async function readJson(file: string): Promise<Json | null> {
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size > 1_048_576) return null
    return record(JSON.parse(await readFile(file, 'utf8')))
  } catch {
    return null
  }
}

async function claudeCredentials(profile: UsageProfile): Promise<Json | null> {
  const file = await readJson(join(profile.directoryPath, '.credentials.json'))
  if (process.platform !== 'darwin') return file
  // On macOS the CLI uses Keychain; a leftover credentials file may be stale.
  // Never fall back from a custom profile to the default account's Keychain item.
  const directories = new Set([profile.directoryPath])
  try { directories.add(await realpath(profile.directoryPath)) } catch { /* missing profile */ }
  const services = profile.id === 'claude:default'
    ? ['Claude Code-credentials']
    : [...directories].map((dir) => `Claude Code-credentials-${createHash('sha256').update(dir.normalize('NFC')).digest('hex').slice(0, 8)}`)
  for (const service of services) {
    const credentials = await new Promise<Json | null>((resolve) => {
      execFile('/usr/bin/security', ['find-generic-password', '-s', service, '-w'],
        { timeout: 3000, maxBuffer: 1_048_576 }, (error, stdout) => {
          if (error) { resolve(null); return }
          try { resolve(record(JSON.parse(stdout))) } catch { resolve(null) }
        })
    })
    if (credentials) return credentials
  }
  return file
}

async function fetchProfile(profile: UsageProfile): Promise<AccountUsage> {
  const result: AccountUsage = {
    profileId: profile.id, status: 'notSignedIn', plan: null, windows: [], updatedAt: Date.now()
  }
  try {
    const credentials = profile.provider === 'claude'
      ? await claudeCredentials(profile)
      : await readJson(join(profile.directoryPath, 'auth.json'))
    if (!credentials) return result
    const auth = record(credentials[profile.provider === 'claude' ? 'claudeAiOauth' : 'tokens'])
    const token = auth[profile.provider === 'claude' ? 'accessToken' : 'access_token']
    if (typeof token !== 'string' || !token) return { ...result, status: 'unavailable' }
    if (typeof auth.expiresAt === 'number' && auth.expiresAt < Date.now()) {
      return { ...result, status: 'expired' }
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (profile.provider === 'claude') headers['anthropic-beta'] = 'oauth-2025-04-20'
    else if (typeof auth.account_id === 'string') headers['ChatGPT-Account-Id'] = auth.account_id
    // Fixed provider endpoints, no redirects, no credentials in renderer/IPC/logs.
    // These are the account-usage endpoints also used by Orca, not inference APIs.
    const response = await net.fetch(profile.provider === 'claude'
      ? 'https://api.anthropic.com/api/oauth/usage'
      : 'https://chatgpt.com/backend-api/wham/usage', {
      headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) {
      await response.body?.cancel()
      return { ...result, status: response.status === 401 || response.status === 403
        ? 'expired' : response.status === 429 ? 'rateLimited' : 'unavailable' }
    }
    const data = record(await response.json())
    const windows = parseUsageWindows(profile.provider, data)
    const plan = data.plan_type ?? auth.subscriptionType
    const reset = profile.provider === 'codex'
      ? { resetCredits: await fetchCredits(headers), authFingerprint: fingerprint(auth) } : {}
    return { ...result, windows, status: windows.length ? 'ready' : 'noData',
      ...reset,
      plan: typeof plan === 'string' ? plan.slice(0, 80) : null, updatedAt: Date.now() }
  } catch {
    // Network and credential errors can contain secrets. Return only a fixed status.
    return { ...result, status: 'unavailable' }
  }
}

// Keep ambiguous attempts bound to the same account and request key. No automatic POST retries.
const resetAttempts = new Map<string, { fingerprint: string; outcome?: UsageResetOutcome }>()
let resetting = false
export async function consumeUsageReset(request: UsageResetRequest): Promise<UsageResetOutcome> {
  if (!request || request.confirmed !== true || typeof request.profileId !== 'string' ||
    typeof request.authFingerprint !== 'string' || typeof request.idempotencyKey !== 'string' ||
    !/^[a-f0-9]{64}$/.test(request.authFingerprint) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(request.idempotencyKey)) return 'unavailable'
  if (resetting) return 'busy'
  resetting = true
  try {
    const profile = listUsageProfiles().find((item) => item.id === request.profileId && item.provider === 'codex')
    if (!profile) return 'unavailable'
    const auth = record((await readJson(join(profile.directoryPath, 'auth.json')))?.tokens)
    if (typeof auth.access_token !== 'string' || fingerprint(auth) !== request.authFingerprint) return 'accountChanged'
    const previous = resetAttempts.get(request.idempotencyKey)
    if (previous && previous.fingerprint !== request.authFingerprint) return 'accountChanged'
    if (previous?.outcome) return previous.outcome
    if (!previous && [...resetAttempts.values()].some((attempt) => attempt.fingerprint === request.authFingerprint && !attempt.outcome)) return 'busy'
    if (!previous && resetAttempts.size >= 200) return 'unavailable'
    const attempt = previous ?? { fingerprint: request.authFingerprint }
    resetAttempts.set(request.idempotencyKey, attempt)
    const headers: Record<string, string> = { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' }
    if (typeof auth.account_id === 'string') headers['ChatGPT-Account-Id'] = auth.account_id
    const response = await net.fetch(`${creditsUrl}/consume`, {
      method: 'POST', headers, body: JSON.stringify({ redeem_request_id: request.idempotencyKey }),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) { await response.body?.cancel(); return 'unavailable' }
    const code = record(await response.json()).code
    const outcomes: Record<string, UsageResetOutcome> = { reset: 'reset', already_redeemed: 'alreadyRedeemed', nothing_to_reset: 'nothingToReset', no_credit: 'noCredit' }
    const outcome = typeof code === 'string' && Object.hasOwn(outcomes, code) ? outcomes[code] : undefined
    if (!outcome) return 'unavailable'
    attempt.outcome = outcome
    return outcome
  } catch { return 'unavailable' }
  finally {
    // Drain older reads before invalidation so they cannot restore stale quota data.
    await Promise.allSettled([...pending.values()])
    cache.clear()
    resetting = false
  }
}

const cache = new Map<string, { result: AccountUsage; until: number }>()
const pending = new Map<string, Promise<AccountUsage>>()

async function readProfile(profile: UsageProfile, force: boolean): Promise<AccountUsage> {
  const key = `${profile.id}:${profile.directoryPath}`
  const entry = cache.get(key)
  if (entry && (Date.now() < entry.until && (entry.result.status === 'rateLimited' || !force || Date.now() - entry.result.updatedAt < 15_000))) {
    return entry.result
  }
  const current = pending.get(key)
  if (current) return current
  const task = fetchProfile(profile).then((result) => {
    if (cache.size >= 200) cache.delete(cache.keys().next().value!)
    cache.set(key, { result, until: Date.now() + (result.status === 'rateLimited' ? 300_000 : 60_000) })
    return result
  }).finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}

export async function getAccountUsage(ids: string[], force = false): Promise<AccountUsage[]> {
  const wanted = new Set(ids)
  const profiles = listUsageProfiles().filter((profile) => wanted.has(profile.id))
  const results: AccountUsage[] = []
  // Bound parallel requests even with many isolated accounts.
  for (let index = 0; index < profiles.length; index += 2) {
    results.push(...await Promise.all(profiles.slice(index, index + 2).map((profile) => readProfile(profile, force))))
  }
  return results
}
