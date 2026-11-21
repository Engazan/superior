import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ getPath: vi.fn(), pickFolder: vi.fn() }))
const clone = vi.hoisted(() => ({ execFile: vi.fn(), addFolder: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: electron.getPath },
  dialog: { showOpenDialog: electron.pickFolder },
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: vi.fn(),
    encryptString: vi.fn()
  }
}))
vi.mock('child_process', () => ({ execFile: clone.execFile }))
vi.mock('./workspace.service', () => ({ addFolderByPath: clone.addFolder }))

import { cloneRepository, listIntegrations, saveIntegration } from './integrations.service'

describe('integration secret projection', () => {
  let userData: string

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-integrations-'))
    electron.getPath.mockReturnValue(userData)
  })

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true })
    electron.getPath.mockReset()
    electron.pickFolder.mockReset()
    clone.execFile.mockReset()
    clone.addFolder.mockReset()
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

  it('binds a clone to its chosen integration and scopes its Git credentials', async () => {
    const selected = saveIntegration({
      id: '', provider: 'gitlab', name: 'Work',
      baseUrl: 'https://git.example.test/forge', token: 'private-token'
    }).integrations[0]
    const args = {
      integrationId: selected.id, fullName: 'team/subgroup/repo',
      cloneUrl: 'https://git.example.test/forge/team/subgroup/repo.git'
    }
    electron.pickFolder.mockResolvedValue({ canceled: false, filePaths: [userData] })
    clone.execFile.mockImplementation((_command, _args, _options, done) => done(null))
    clone.addFolder.mockReturnValue({ activeWorkspaceId: 'test-workspace' })

    await expect(cloneRepository({ ...args, cloneUrl: args.cloneUrl.replace('git.example.test', 'other.example.test') }))
      .resolves.toEqual({ error: 'invalid-repo' })
    await expect(cloneRepository({ ...args, cloneUrl: args.cloneUrl.replace('https:', 'http:') }))
      .resolves.toEqual({ error: 'invalid-repo' })
    expect(clone.execFile).not.toHaveBeenCalled()

    await expect(cloneRepository(args)).resolves.toMatchObject({ state: { activeWorkspaceId: 'test-workspace' } })
    expect(clone.execFile).toHaveBeenCalledWith(
      'git', ['clone', '--', args.cloneUrl, path.join(userData, 'repo')],
      expect.objectContaining({
        env: expect.objectContaining({
          GIT_CONFIG_KEY_0: 'http.https://git.example.test/.extraHeader',
          GIT_CONFIG_KEY_1: 'http.followRedirects',
          GIT_CONFIG_VALUE_1: 'false'
        })
      }), expect.any(Function)
    )
    expect(clone.addFolder).toHaveBeenCalledWith(path.join(userData, 'repo'), {
      gitIntegration: { integrationId: selected.id, fullName: args.fullName }
    })
  })

})
