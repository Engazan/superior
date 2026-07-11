import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ getPath: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: electron.getPath },
  dialog: { showOpenDialog: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: vi.fn(),
    encryptString: vi.fn()
  }
}))
vi.mock('./workspace.service', () => ({ addFolderByPath: vi.fn() }))

import { listIntegrations, saveIntegration } from './integrations.service'

describe('integration secret projection', () => {
  let userData: string

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-integrations-'))
    electron.getPath.mockReturnValue(userData)
  })

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true })
    electron.getPath.mockReset()
  })

  it('never returns a saved token to the renderer and preserves it on metadata-only edits', () => {
    const created = saveIntegration({
      id: '',
      provider: 'gitea',
      name: 'Work',
      baseUrl: 'https://git.example.test',
      token: 'secret-token'
    }).integrations[0]

    expect(created).toMatchObject({ token: '', hasToken: true })
    expect(listIntegrations().integrations[0]).toMatchObject({ token: '', hasToken: true })

    const updated = saveIntegration({ ...created, name: 'Renamed', token: '' }).integrations[0]
    expect(updated).toMatchObject({ name: 'Renamed', token: '', hasToken: true })

    const disk = JSON.parse(fs.readFileSync(path.join(userData, 'integrations.json'), 'utf8'))
    expect(disk.integrations[0].token).toBe('secret-token')
  })
})
