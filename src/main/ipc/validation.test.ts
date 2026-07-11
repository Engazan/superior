import { describe, expect, it } from 'vitest'
import { isIntegration, isStartAgentArgs, validId } from './validation'

describe('IPC runtime validation', () => {
  it('accepts a bounded terminal launch and rejects malformed/range-invalid payloads', () => {
    const valid = {
      command: 'codex',
      label: 'Codex',
      cwd: '/project',
      workspaceId: 'workspace-1',
      tabId: 'tab-1',
      cols: 80,
      rows: 24
    }
    expect(isStartAgentArgs(valid)).toBe(true)
    expect(isStartAgentArgs({ ...valid, cols: Number.NaN })).toBe(false)
    expect(isStartAgentArgs({ ...valid, launchTarget: { kind: 'remote', host: 42, path: '~' } })).toBe(false)
  })

  it('rejects empty ids and malformed integration payloads', () => {
    expect(validId('session-1')).toBe(true)
    expect(validId('')).toBe(false)
    expect(isIntegration({ id: '', provider: 'github', name: 'GitHub', baseUrl: '', token: 'x' })).toBe(true)
    expect(isIntegration({ id: '', provider: 'unknown', name: 'x', baseUrl: '', token: 'x' })).toBe(false)
  })
})
