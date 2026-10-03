import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isReady: () => false, getPath: () => '' },
  dialog: {}
}))

import { extractFolderArg } from './cli-launcher.service'

describe('extractFolderArg', () => {
  const roots: string[] = []

  const makeRoot = (): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-cli-'))
    roots.push(root)
    return root
  }

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('resolves an explicit relative --path against the caller working directory', () => {
    const cwd = makeRoot()
    const project = path.join(cwd, 'project')
    fs.mkdirSync(project)

    expect(extractFolderArg(['electron', '--path', 'project'], cwd, { requireFlag: true })).toBe(
      fs.realpathSync(project)
    )
  })

  it('requires the explicit flag when requested for development startup', () => {
    const cwd = makeRoot()
    const project = path.join(cwd, 'project')
    fs.mkdirSync(project)

    expect(extractFolderArg(['electron', project], cwd, { requireFlag: true })).toBeNull()
  })

  it('uses the last valid bare directory and ignores flags and files', () => {
    const cwd = makeRoot()
    const first = path.join(cwd, 'first')
    const second = path.join(cwd, 'second')
    fs.mkdirSync(first)
    fs.mkdirSync(second)
    fs.writeFileSync(path.join(cwd, 'readme.txt'), '')

    expect(extractFolderArg(['electron', first, '--inspect', 'readme.txt', second], cwd)).toBe(
      fs.realpathSync(second)
    )
  })

  it('does not fall back to a bare argument when an explicit path is invalid', () => {
    const cwd = makeRoot()
    const project = path.join(cwd, 'project')
    fs.mkdirSync(project)

    expect(extractFolderArg(['electron', project, '--path', 'missing'], cwd)).toBeNull()
  })
})
