import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseUnifiedDiff, unquoteGitPath } from './git.diff'

describe('unquoteGitPath', () => {
  it('passes unquoted paths through', () => {
    expect(unquoteGitPath('src/plain.txt')).toBe('src/plain.txt')
  })

  it('decodes octal escapes as UTF-8 bytes', () => {
    expect(unquoteGitPath('"\\303\\241-\\304\\215.txt"')).toBe('á-č.txt')
  })

  it('decodes simple escapes', () => {
    expect(unquoteGitPath('"he\\"llo\\t.txt"')).toBe('he"llo\t.txt')
    expect(unquoteGitPath('"back\\\\slash"')).toBe('back\\slash')
  })
})

// The parser's contract is "whatever git actually prints" — so exercise it
// against real git output from a throwaway repo rather than hand-written
// fixtures that could drift from git's real quoting/tab rules.
describe('parseUnifiedDiff on real git output', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitdiff-test-'))
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' })

  beforeAll(() => {
    git('init', '-q')
    git('config', 'user.email', 't@t')
    git('config', 'user.name', 't')
    fs.writeFileSync(path.join(repo, 'á-č-ž.txt'), 'jeden\ndva\n')
    fs.mkdirSync(path.join(repo, 'x b'))
    fs.writeFileSync(path.join(repo, 'x b', 'y.txt'), 'obsah\n')
    fs.writeFileSync(path.join(repo, 'starý.txt'), 'na premenovanie\n')
    fs.writeFileSync(path.join(repo, 'zmazať.txt'), 'preč\n')
    git('add', '-A')
    git('commit', '-qm', 'init')

    fs.writeFileSync(path.join(repo, 'á-č-ž.txt'), 'jeden\ndva\ntri\n')
    fs.appendFileSync(path.join(repo, 'x b', 'y.txt'), 'viac\n')
    fs.renameSync(path.join(repo, 'starý.txt'), path.join(repo, 'nový.txt'))
    fs.rmSync(path.join(repo, 'zmazať.txt'))
    git('add', '-A')
  })

  afterAll(() => {
    fs.rmSync(repo, { recursive: true, force: true })
  })

  it('decodes quoted paths under default core.quotePath', () => {
    const files = parseUnifiedDiff(git('diff', '--cached', '--no-color', '--no-ext-diff', '-M'))
    const paths = files.map((f) => f.path)
    expect(paths).toContain('á-č-ž.txt')
    expect(paths).toContain('zmazať.txt')
  })

  it('parses raw paths with core.quotePath=false (the app default)', () => {
    const files = parseUnifiedDiff(
      git('-c', 'core.quotePath=false', 'diff', '--cached', '--no-color', '--no-ext-diff', '-M')
    )
    const byPath = new Map(files.map((f) => [f.path, f]))
    expect(byPath.get('á-č-ž.txt')?.additions).toBe(1)
    // ' b/'-containing path: the header split is ambiguous, the tab-corrected
    // +++ line must win.
    expect(byPath.get('x b/y.txt')?.additions).toBe(1)
    expect(byPath.get('zmazať.txt')?.status).toBe('deleted')
    const renamed = files.find((f) => f.status === 'renamed')
    expect(renamed?.oldPath).toBe('starý.txt')
    expect(renamed?.path).toBe('nový.txt')
  })

  it('parses hunks with line numbers', () => {
    const files = parseUnifiedDiff(
      git('-c', 'core.quotePath=false', 'diff', '--cached', '--no-color', '--no-ext-diff', '-M')
    )
    const file = files.find((f) => f.path === 'á-č-ž.txt')
    const added = file?.hunks[0]?.lines.find((l) => l.type === 'add')
    expect(added?.content).toBe('tri')
    expect(added?.newLine).toBe(3)
  })
})
