import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(),
  fetch: vi.fn(),
  keychain: [] as string[][],
  keychainCredentials: new Map<string, string>()
}))
vi.mock('electron', () => ({ net: { fetch: mocks.fetch } }))
vi.mock('./claude-paths', () => ({ homeDir: () => '/profiles' }))
vi.mock('./custom-memory.service', () => ({
  listCustomMemoryPresets: () => [
    { id: 'claude:work', provider: 'claude', name: 'work', directoryPath: '/profiles/.claude-work' },
    { id: 'codex:work', provider: 'codex', name: 'work', directoryPath: '/profiles/.codex-work' }
  ]
}))
vi.mock('node:fs/promises', () => ({
  stat: async (file: string) => {
    if (!mocks.files.has(file)) throw new Error('ENOENT')
    return { isFile: () => true, size: mocks.files.get(file)!.length }
  },
  readFile: async (file: string) => mocks.files.get(file),
  realpath: async (file: string) => file
}))
vi.mock('node:child_process', () => ({
  execFile: (_file: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string) => void) => {
    mocks.keychain.push(args)
    const value = mocks.keychainCredentials.get(args[2])
    callback(value ? null : new Error('not found'), value ?? '')
  }
}))

let service: typeof import('./account-usage.service')
beforeEach(async () => {
  vi.resetModules()
  mocks.files.clear()
  mocks.fetch.mockReset()
  mocks.keychain.length = 0
  mocks.keychainCredentials.clear()
  service = await import('./account-usage.service')
})
afterEach(() => { vi.useRealTimers() })

function claude(file = '/profiles/.claude/.credentials.json', token = 'test-default-token'): void {
  mocks.files.set(file, JSON.stringify({ claudeAiOauth: { accessToken: token, subscriptionType: 'max' } }))
}
function response(data: unknown): void {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => data })
}

describe('Codex reset tickets', () => {
  const key = '12345678-1234-4234-8234-123456789012'
  async function request() {
    mocks.files.set('/profiles/.codex-work/auth.json', JSON.stringify({ tokens: { access_token: 'custom-token', account_id: 'work' } }))
    response({ available_count: 2, credits: [{ status: 'available', expires_at: 1790000000 }] })
    const [usage] = await service.getAccountUsage(['custom:codex:work'])
    return { profileId: usage.profileId, authFingerprint: usage.authFingerprint!, idempotencyKey: key, confirmed: true as const }
  }

  it('preserves authoritative counts and distinguishes unknown from zero', () => {
    expect(service.parseResetCredits({})).toBeNull()
    expect(service.parseResetCredits({ available_count: 0 })).toEqual({ availableCount: 0, credits: null })
    expect(service.parseResetCredits({ available_count: 3, credits: [
      { status: 'available', expires_at: '1790000000' }, { status: 'available', expires_at: 1790000000000 },
      { status: 'expired', expires_at: 1 }
    ] })).toEqual({ availableCount: 3, credits: [{ expiresAt: 1790000000000 }, { expiresAt: 1790000000000 }] })
  })

  it('reads tickets with custom credentials and never exposes tokens', async () => {
    await request()
    const [usage] = await service.getAccountUsage(['custom:codex:work'])
    expect(usage.resetCredits?.availableCount).toBe(2)
    expect(JSON.stringify(usage)).not.toContain('custom-token')
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('/rate-limit-reset-credits'), expect.objectContaining({
      headers: { Authorization: 'Bearer custom-token', 'ChatGPT-Account-Id': 'work' }
    }))
  })

  it('requires confirmation and rejects changed accounts without a POST', async () => {
    const args = await request()
    mocks.fetch.mockClear()
    expect(await service.consumeUsageReset({ ...args, confirmed: false } as never)).toBe('unavailable')
    mocks.files.set('/profiles/.codex-work/auth.json', JSON.stringify({ tokens: { access_token: 'other' } }))
    expect(await service.consumeUsageReset(args)).toBe('accountChanged')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('consumes once with the scoped account, deduplicates and invalidates usage', async () => {
    const args = await request()
    mocks.fetch.mockClear()
    response({ code: 'reset' })
    expect(await service.consumeUsageReset(args)).toBe('reset')
    expect(await service.consumeUsageReset(args)).toBe('reset')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('/consume'), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ redeem_request_id: key }),
      headers: expect.objectContaining({ Authorization: 'Bearer custom-token', 'ChatGPT-Account-Id': 'work' })
    }))
    response({ available_count: 1, rate_limit: { primary_window: { used_percent: 4 } } })
    const [fresh] = await service.getAccountUsage([args.profileId], true)
    expect(fresh.resetCredits?.availableCount).toBe(1)
    expect(fresh.windows[0].usedPercent).toBe(4)
  })

  it('retries ambiguous failures only with the same key', async () => {
    const args = await request()
    mocks.fetch.mockClear()
    mocks.fetch.mockRejectedValue(new Error('network'))
    expect(await service.consumeUsageReset(args)).toBe('unavailable')
    expect(await service.consumeUsageReset({ ...args, idempotencyKey: '22345678-1234-4234-8234-123456789012' })).toBe('busy')
    response({ code: 'already_redeemed' })
    expect(await service.consumeUsageReset(args)).toBe('alreadyRedeemed')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.fetch.mock.calls.map((call) => JSON.parse(call[1].body).redeem_request_id)).toEqual([key, key])
  })

  it.each([['nothing_to_reset', 'nothingToReset'], ['no_credit', 'noCredit']])('handles %s without fabricating a reset', async (code, outcome) => {
    const args = await request()
    response({ code })
    expect(await service.consumeUsageReset(args)).toBe(outcome)
  })
})

describe('account usage per configuration directory', () => {
  it.skipIf(process.platform !== 'darwin')('prefers current macOS Keychain credentials over a stale credentials file', async () => {
    claude()
    mocks.keychainCredentials.set('Claude Code-credentials', JSON.stringify({ claudeAiOauth: { accessToken: 'current-keychain-token' } }))
    response({ five_hour: { utilization: 15 } })
    await service.getAccountUsage(['claude:default'])
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer current-keychain-token' })
    }))
  })
  it('discovers default and custom profiles with distinct ids and paths', () => {
    const profiles = service.listUsageProfiles()
    expect(profiles.map((profile) => profile.id)).toEqual(['claude:default', 'codex:default', 'custom:claude:work', 'custom:codex:work'])
    expect(profiles[3].directoryPath).toBe('/profiles/.codex-work')
  })

  it('uses only the selected custom Claude credentials, never the default account', async () => {
    claude()
    claude('/profiles/.claude-work/.credentials.json', 'test-work-token')
    response({ five_hour: { utilization: 35, resets_at: '2026-09-11T12:00:00Z' } })
    const values = await service.getAccountUsage(['custom:claude:work'])
    expect(mocks.fetch).toHaveBeenCalledWith('https://api.anthropic.com/api/oauth/usage', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-work-token' }), redirect: 'error'
    }))
    expect(values[0].windows[0].usedPercent).toBe(35)
    expect(values[0].profileId).toBe('custom:claude:work')
    expect(JSON.stringify(values)).not.toContain('token')
  })

  it('does not use default credentials when custom credentials are missing', async () => {
    claude()
    const values = await service.getAccountUsage(['custom:claude:work'])
    expect(values[0].status).toBe('notSignedIn')
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.keychain.every((args) => args.includes('Claude Code-credentials') === false)).toBe(true)
  })

  it('uses custom Codex account id and token for its own request', async () => {
    mocks.files.set('/profiles/.codex-work/auth.json', JSON.stringify({ tokens: { access_token: 'test-codex-token', account_id: 'work-account' } }))
    response({ plan_type: 'pro', rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_at: 1790000000 } } })
    const [value] = await service.getAccountUsage(['custom:codex:work'])
    expect(mocks.fetch).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/usage', expect.objectContaining({
      headers: { Authorization: 'Bearer test-codex-token', 'ChatGPT-Account-Id': 'work-account' }
    }))
    expect(value.plan).toBe('pro')
    expect(value.windows[0]).toMatchObject({ label: '5h', resetsAt: 1790000000000 })
  })

  it('does not manufacture zero usage for missing or malformed windows', () => {
    expect(service.parseUsageWindows('claude', { five_hour: null, seven_day: { utilization: '20' } })).toEqual([])
    expect(service.parseUsageWindows('codex', { rate_limit: {} })).toEqual([])
    expect(service.parseUsageWindows('claude', { five_hour: { utilization: 0 } })[0].usedPercent).toBe(0)
  })

  it('retains distinct Claude windows and uses actual Codex window durations', () => {
    const windows = service.parseUsageWindows('claude', {
      five_hour: { utilization: 20 }, seven_day: { utilization: 90 }, seven_day_sonnet: { utilization: 30 }
    })
    expect(windows.map((window) => window.label)).toEqual(['5h', '7d', '7d · sonnet'])
    expect(service.parseUsageWindows('codex', { rate_limit: { primary_window: { used_percent: 8, limit_window_seconds: 3600 } } })[0].label).toBe('1h')
  })

  it('rejects unknown profile ids instead of treating them as filesystem paths', async () => {
    expect(await service.getAccountUsage(['../../secret', 'claude:missing'])).toEqual([])
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('coalesces concurrent requests and caches results even across manual refresh clicks', async () => {
    claude()
    response({ five_hour: { utilization: 10 } })
    await Promise.all([service.getAccountUsage(['claude:default']), service.getAccountUsage(['claude:default'])])
    await service.getAccountUsage(['claude:default'], true)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('respects rate-limit backoff even for manual refreshes', async () => {
    vi.useFakeTimers()
    claude()
    mocks.fetch.mockResolvedValue({ ok: false, status: 429 })
    expect((await service.getAccountUsage(['claude:default']))[0].status).toBe('rateLimited')
    vi.setSystemTime(Date.now() + 60_000)
    await service.getAccountUsage(['claude:default'], true)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('reports expired credentials without sending an authenticated request', async () => {
    mocks.files.set('/profiles/.claude/.credentials.json', JSON.stringify({ claudeAiOauth: { accessToken: 'expired-token', expiresAt: 1 } }))
    expect((await service.getAccountUsage(['claude:default']))[0].status).toBe('expired')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('returns a fixed status without leaking response errors or credentials', async () => {
    claude()
    mocks.fetch.mockRejectedValue(new Error('secret-token in transport error'))
    const values = await service.getAccountUsage(['claude:default'])
    expect(values[0].status).toBe('unavailable')
    expect(JSON.stringify(values)).not.toContain('secret')
  })
})
