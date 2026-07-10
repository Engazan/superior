import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_UNTRACKED_BYTES, readUntrackedFile } from './git.untracked'

describe('readUntrackedFile', () => {
  const roots: string[] = []

  const makeRoot = (): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-untracked-'))
    roots.push(root)
    return root
  }

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  })

  it('reads a small regular file', async () => {
    const root = makeRoot()
    fs.writeFileSync(path.join(root, 'note.txt'), 'hello\n')

    await expect(readUntrackedFile(root, 'note.txt')).resolves.toEqual(Buffer.from('hello\n'))
  })

  it('rejects an oversized file without loading it into the diff', async () => {
    const root = makeRoot()
    fs.writeFileSync(path.join(root, 'large.log'), Buffer.alloc(MAX_UNTRACKED_BYTES + 1))

    await expect(readUntrackedFile(root, 'large.log')).resolves.toBeNull()
  })

  it('rejects a path that escapes the repository root', async () => {
    const parent = makeRoot()
    const root = path.join(parent, 'repo')
    fs.mkdirSync(root)
    fs.writeFileSync(path.join(parent, 'secret.txt'), 'private')

    await expect(readUntrackedFile(root, '../secret.txt')).resolves.toBeNull()
  })

  it.skipIf(process.platform === 'win32')('does not follow untracked symlinks', async () => {
    const parent = makeRoot()
    const root = path.join(parent, 'repo')
    fs.mkdirSync(root)
    const secret = path.join(parent, 'secret.txt')
    fs.writeFileSync(secret, 'private')
    fs.symlinkSync(secret, path.join(root, 'linked-secret.txt'))

    await expect(readUntrackedFile(root, 'linked-secret.txt')).resolves.toBeNull()
  })
})
