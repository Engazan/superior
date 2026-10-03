import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  isWithinWorkspaceFolder: vi.fn(),
  openPath: vi.fn(),
  openExternal: vi.fn()
}))

vi.mock('electron', () => ({
  shell: {
    openPath: mocks.openPath,
    openExternal: mocks.openExternal
  }
}))

vi.mock('./settings.service', () => ({ getSettings: mocks.getSettings }))
vi.mock('./workspace.service', () => ({
  isWithinWorkspaceFolder: mocks.isWithinWorkspaceFolder
}))

import { openFileTarget } from './file-opener.service'

describe('openFileTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isWithinWorkspaceFolder.mockReturnValue(true)
  })

  it('hands validated files back to Superior when its internal editor is selected', async () => {
    mocks.getSettings.mockReturnValue({ fileOpener: 'superior' })

    await expect(openFileTarget({ path: '/workspace/src/App.tsx', line: 42 })).resolves.toEqual({
      ok: true,
      openInApp: true
    })
    expect(mocks.openPath).not.toHaveBeenCalled()
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })

  it('still rejects targets outside opened workspaces before handing them to the app', async () => {
    mocks.isWithinWorkspaceFolder.mockReturnValue(false)
    mocks.getSettings.mockReturnValue({ fileOpener: 'superior' })

    await expect(openFileTarget({ path: '/private/secret.txt' })).resolves.toEqual({
      ok: false,
      error: 'Path is outside the opened workspace folders.'
    })
  })
})
