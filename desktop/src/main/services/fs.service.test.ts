import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const workspace = vi.hoisted(() => ({ isWithinWorkspaceFolder: vi.fn() }))

vi.mock('./workspace.service', () => ({
  isWithinWorkspaceFolder: workspace.isWithinWorkspaceFolder
}))

import {
  listDir,
  readFilePreview,
  searchFileContents,
  searchFiles,
  writeFilePreview
} from './fs.service'

describe('filesystem preview service', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-fs-'))
    workspace.isWithinWorkspaceFolder.mockImplementation((candidate: string) => {
      const resolved = path.resolve(candidate)
      return resolved === root || resolved.startsWith(`${root}${path.sep}`)
    })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    workspace.isWithinWorkspaceFolder.mockReset()
  })

  it('lists folders before files and hides Git metadata', async () => {
    fs.mkdirSync(path.join(root, '.git'))
    fs.mkdirSync(path.join(root, 'src'))
    fs.writeFileSync(path.join(root, 'z.txt'), 'z')
    fs.writeFileSync(path.join(root, 'a.txt'), 'a')

    await expect(listDir(root)).resolves.toEqual({
      entries: [
        { name: 'src', path: path.join(root, 'src'), isDirectory: true },
        { name: 'a.txt', path: path.join(root, 'a.txt'), isDirectory: false },
        { name: 'z.txt', path: path.join(root, 'z.txt'), isDirectory: false }
      ]
    })
  })

  it('caps text previews and reports truncation without reading the remainder', async () => {
    const file = path.join(root, 'note.txt')
    fs.writeFileSync(file, 'abcdefgh')

    await expect(readFilePreview(file, { read: true, maxBytes: 4, asBase64: false })).resolves.toMatchObject({
      size: 8,
      truncated: true,
      encoding: 'utf8',
      content: 'abcd',
      isBinary: false
    })
  })

  it('only base64-encodes images that fit in the approved allocation', async () => {
    const file = path.join(root, 'image.bin')
    fs.writeFileSync(file, Buffer.from([0, 1, 2, 3]))

    await expect(readFilePreview(file, { read: true, maxBytes: 4, asBase64: true })).resolves.toMatchObject({
      content: 'AAECAw==',
      encoding: 'base64',
      isBinary: true,
      truncated: false
    })
    await expect(readFilePreview(file, { read: true, maxBytes: 3, asBase64: true })).resolves.toMatchObject({
      content: '',
      truncated: true
    })
  })

  it('never reads or writes a path outside the workspace boundary', async () => {
    const outside = path.join(path.dirname(root), 'superior-outside.txt')
    fs.writeFileSync(outside, 'private')

    await expect(readFilePreview(outside, { read: true, maxBytes: 100, asBase64: false })).resolves.toMatchObject({
      error: 'Path is outside the opened workspace folders.'
    })
    await expect(writeFilePreview(outside, 'changed')).resolves.toEqual({
      ok: false,
      error: 'Path is outside the opened workspace folders.'
    })
    expect(fs.readFileSync(outside, 'utf8')).toBe('private')
    fs.rmSync(outside, { force: true })
  })

  it('overwrites an existing in-workspace text file and returns its new size', async () => {
    const file = path.join(root, 'editable.txt')
    fs.writeFileSync(file, 'old')

    await expect(writeFilePreview(file, 'updated\n')).resolves.toEqual({ ok: true, size: 8 })
    expect(fs.readFileSync(file, 'utf8')).toBe('updated\n')
  })

  it('searches recursively but skips node_modules', async () => {
    fs.mkdirSync(path.join(root, 'src', 'nested'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src', 'nested', 'match.ts'), '')
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'match.ts'), '')

    await expect(searchFiles(root, 'match')).resolves.toEqual({
      entries: [{ name: 'match.ts', path: path.join(root, 'src', 'nested', 'match.ts'), isDirectory: false }],
      truncated: false
    })
  })

  it('matches partial query words independently across the relative path', async () => {
    const matching = path.join(root, 'src', 'app-langs', 'editor', 'configuration.json')
    const missingSecondPart = path.join(root, 'src', 'app-langs', 'editor', 'settings.json')
    fs.mkdirSync(path.dirname(matching), { recursive: true })
    fs.writeFileSync(matching, '')
    fs.writeFileSync(missingSecondPart, '')

    await expect(searchFiles(root, 'langs configuration')).resolves.toEqual({
      entries: [{ name: 'configuration.json', path: matching, isDirectory: false }],
      truncated: false
    })
  })

  it('normalizes case and repeated whitespace in multi-part queries', async () => {
    const matching = path.join(root, 'LANGS', 'Configuration', 'schema.json')
    fs.mkdirSync(path.dirname(matching), { recursive: true })
    fs.writeFileSync(matching, '')

    await expect(searchFiles(root, '  langs   configuration  ')).resolves.toMatchObject({
      entries: [{ name: 'schema.json', path: matching, isDirectory: false }]
    })
  })

  it('searches file contents and returns line previews with match positions', async () => {
    const file = path.join(root, 'src', 'config.ts')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'const first = true\nexport const Configuration = first\n')

    const result = await searchFileContents(root, 'configuration')
    expect(result).toMatchObject({
      matches: [{
        name: 'config.ts',
        path: file,
        line: 2,
        column: 14,
        preview: 'export const Configuration = first',
        matchStart: 13,
        matchLength: 13
      }],
      truncated: false
    })
    expect(result.matches[0].contextLines).toHaveLength(10)
    expect(result.matches[0].contextLines[3]).toEqual({
      line: 2,
      text: 'export const Configuration = first'
    })
    expect(result.matches[0].contextLines.map((line) => line.line)).toEqual([
      null, null, 1, 2, 3, null, null, null, null, null
    ])
  })

  it('returns surrounding source with the match fixed on preview row four', async () => {
    const file = path.join(root, 'context.ts')
    const lines = Array.from({ length: 15 }, (_, index) =>
      index === 7 ? 'const needle = true' : `const line${index + 1} = true`
    )
    fs.writeFileSync(file, lines.join('\n'))

    const result = await searchFileContents(root, 'needle')
    const context = result.matches[0].contextLines
    expect(context).toHaveLength(10)
    expect(context.map((line) => line.line)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(context[3]).toEqual({ line: 8, text: 'const needle = true' })
  })

  it('skips binary files during content search', async () => {
    const file = path.join(root, 'binary.dat')
    fs.writeFileSync(file, Buffer.from('before\0needle\0after'))

    await expect(searchFileContents(root, 'needle')).resolves.toEqual({
      matches: [],
      truncated: false
    })
  })

  it('bounds long content previews while keeping the match highlighted', async () => {
    const file = path.join(root, 'long-line.txt')
    fs.writeFileSync(file, `${'a'.repeat(400)}needle${'b'.repeat(400)}`)

    const result = await searchFileContents(root, 'needle')
    expect(result.matches).toHaveLength(1)
    const match = result.matches[0]
    expect(match.preview.length).toBeLessThanOrEqual(242)
    expect(match.preview.slice(match.matchStart, match.matchStart + match.matchLength)).toBe('needle')
  })
})
