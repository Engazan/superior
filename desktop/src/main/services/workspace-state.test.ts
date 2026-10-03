import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ dialog: {} }))
vi.mock('./worktree.service', () => ({
  createWorktree: vi.fn(),
  existingWorktreePaths: vi.fn(),
  pruneWorktrees: vi.fn(),
  removeWorktree: vi.fn()
}))

import { parseStoredState } from './workspace.service'

describe('workspace persisted-state validation', () => {
  it('keeps valid rows when neighboring rows are malformed', () => {
    const state = parseStoredState({
      profiles: [
        { id: 'profile-1', name: 'Default', createdAt: 1 },
        null,
        { id: 42, name: 'broken', createdAt: 1 }
      ],
      activeProfileId: 'profile-1',
      folders: [
        {
          path: '/project',
          name: 'project',
          profileId: 'profile-1',
          lastOpenedAt: 1
        },
        null,
        { path: 42, name: 'broken', lastOpenedAt: 1 }
      ],
      workspaces: [
        { id: 'workspace-1', folderPath: '/project', name: 'Main', createdAt: 1 },
        'broken'
      ],
      activeWorkspaceId: 'workspace-1'
    })

    expect(state?.profiles.map((p) => p.id)).toEqual(['profile-1'])
    expect(state?.folders.map((f) => f.path)).toEqual(['/project'])
    expect(state?.workspaces.map((w) => w.id)).toEqual(['workspace-1'])
    expect(state?.activeWorkspaceId).toBe('workspace-1')
  })

  it('rejects an unrecognized top-level shape instead of treating it as empty state', () => {
    expect(parseStoredState({ profiles: [] })).toBeNull()
    expect(parseStoredState(null)).toBeNull()
  })
})
