import { describe, expect, it } from 'vitest'
import {
  isAgentTask,
  isIntegration,
  isPrompt,
  isStartAgentArgs,
  isWorkspaceTabs,
  validId
} from './validation'

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

  it('validates persisted-domain mutation payloads before they reach services', () => {
    expect(isAgentTask({
      id: 'task-1',
      folderPath: '/project',
      prompt: 'fix',
      presetId: 'preset-1',
      useWorktree: false,
      status: 'queued',
      createdAt: 1
    })).toBe(true)
    expect(isAgentTask({ id: 'task-1', status: 'invented' })).toBe(false)

    expect(isPrompt({ id: 'prompt-1', name: 'Fix', text: 'Do it', createdAt: 1 })).toBe(true)
    expect(isPrompt({ id: '', name: 'Fix', text: 'Do it', createdAt: 1 })).toBe(false)

    expect(isWorkspaceTabs({
      tabs: [{ id: 'tab-1', name: 'Tab', gridLayout: { rows: [1], cols: [[1]] } }],
      activeTabId: 'tab-1'
    })).toBe(true)
    expect(isWorkspaceTabs({ tabs: 'broken', activeTabId: 42 })).toBe(false)
  })
})
