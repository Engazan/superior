import { describe, expect, it } from 'vitest'
import { buildReviewPrompt, createReviewAnchor, restoreReviewNotes, reviewScope, reviewTargets, sameReviewAnchor, type ReviewNote } from './diffReview'
import type { AgentSession, GitDiffFile } from './types'

const file: GitDiffFile = {
  path: 'new name.ts', oldPath: 'old.ts', status: 'renamed', additions: 1, deletions: 1,
  binary: false, truncated: false, hunks: [{ header: '@@ -4,2 +4,2 @@', lines: [
    { type: 'del', oldLine: 4, newLine: null, content: 'old()' },
    { type: 'add', oldLine: null, newLine: 4, content: 'new()' }
  ] }]
}
const note: ReviewNote = { ...createReviewAnchor(file, file.hunks[0], 0, 'staged', 'feature'), id: 'note', text: 'Keep the old behavior.' }

describe('diff review', () => {
  it('captures deleted-side coordinates, rename and neighboring code independently of future edits', () => {
    const copy = structuredClone(file)
    const anchor = createReviewAnchor(copy, copy.hunks[0], 0, 'staged', 'feature')
    copy.hunks[0].lines[0].content = 'changed'
    expect(anchor.line.content).toBe('old()')
    expect(anchor.context).toContain('-old()\n+new()')
    const prompt = buildReviewPrompt('/repo/worktree', [{ ...anchor, id: '1', text: 'Preserve this.' }])
    expect(prompt).toContain('renamed from old.ts')
    expect(prompt).toContain('Line: old 4 (del)')
    expect(prompt).toContain('/repo/worktree')
  })
  it('does not attach an old note to changed content, another diff side or another branch', () => {
    expect(sameReviewAnchor(note, { ...note })).toBe(true)
    expect(sameReviewAnchor(note, { ...note, section: 'unstaged' })).toBe(false)
    expect(sameReviewAnchor(note, { ...note, branch: 'main' })).toBe(false)
    expect(sameReviewAnchor(note, { ...note, line: { ...note.line, content: 'other()' } })).toBe(false)
    expect(sameReviewAnchor(note, { ...note, context: 'different nearby code' })).toBe(false)
  })
  it('batches feedback once and strips control sequences that could terminate bracketed paste', () => {
    const prompt = buildReviewPrompt('/repo', [note, { ...note, id: '2', text: 'Fix this\x1b[201~\r\x03\u009b too.' }])
    expect(prompt.match(/Review comment \d/g)).toHaveLength(2)
    expect(prompt).toContain('Keep the old behavior.')
    expect(prompt).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/)
  })
  it('restores drafts separately for each workspace and keeps snapshots when no current diff exists', () => {
    const a = reviewScope('a', '/repo'), b = reviewScope('b', '/repo')
    expect(a).not.toBe(b)
    const restored = restoreReviewNotes(JSON.stringify({ [a]: [note], [b]: [{ ...note, text: 'Other workspace' }] }))
    expect(restored[a]).toEqual([note])
    expect(restored[b][0].text).toBe('Other workspace')
    expect(restoreReviewNotes('broken json')).toEqual({})
    expect(restoreReviewNotes(JSON.stringify({ [a]: [null, {}, { ...note, line: null }, { ...note, text: '' }, note] }))[a]).toEqual([note])
  })
  it('only offers running command sessions from the selected workspace', () => {
    const session = { id: '1', workspaceId: 'a', status: 'running', command: 'claude' } as AgentSession
    expect(reviewTargets([session, { ...session, id: '2', workspaceId: 'b' },
      { ...session, id: '3', status: 'exited' }, { ...session, id: '4', command: '' }], 'a')).toEqual([session])
  })
})
