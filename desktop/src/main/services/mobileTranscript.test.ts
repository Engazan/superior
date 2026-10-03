import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const m = vi.hoisted(() => ({ dir: '' }))
vi.mock('./agent-state.service', () => ({ agentStateDir: () => m.dir }))

import { isTranscriptPath, parseTranscriptLines, readTranscript } from './mobileTranscript'

const line = (value: object): string => JSON.stringify(value)
const user = (uuid: string, content: unknown, extra: object = {}): string =>
  line({ type: 'user', uuid, timestamp: '2026-10-02T10:00:00.000Z', message: { role: 'user', content }, ...extra })
const assistant = (uuid: string, content: unknown[]): string =>
  line({ type: 'assistant', uuid, timestamp: '2026-10-02T10:00:01.000Z', message: { role: 'assistant', content } })

describe('parseTranscriptLines', () => {
  it('keeps prompts, replies and tool summaries from the main conversation', () => {
    const messages = parseTranscriptLines([
      user('u1', 'Fix the build'),
      assistant('a1', [{ type: 'thinking', thinking: 'hmm' }]),
      assistant('a2', [{ type: 'tool_use', name: 'Bash', input: { command: 'npm   run build' } }]),
      user('u2', [{ type: 'tool_result', content: 'ok' }]),
      assistant('a3', [{ type: 'text', text: '  Done.  ' }]),
      line({ type: 'attachment', uuid: 'x' }),
      'not json'
    ])
    expect(messages.map(({ role, text, tool }) => ({ role, text, tool }))).toEqual([
      { role: 'user', text: 'Fix the build', tool: undefined },
      { role: 'tool', text: 'npm run build', tool: 'Bash' },
      { role: 'assistant', text: 'Done.', tool: undefined }
    ])
    expect(messages[0].at).toBe(Date.parse('2026-10-02T10:00:00.000Z'))
  })

  it('drops meta, sidechain and command output but shows slash commands', () => {
    const messages = parseTranscriptLines([
      user('m', 'caveat', { isMeta: true }),
      user('s', 'subagent prompt', { isSidechain: true }),
      user('c', '<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>opus</command-args>'),
      user('o', '<local-command-stdout>Set model</local-command-stdout>'),
      user('r', 'Hello<system-reminder>internal</system-reminder>')
    ])
    expect(messages.map((msg) => msg.text)).toEqual(['/model opus', 'Hello'])
  })

  it('gives each block of a multi-block entry its own id', () => {
    const messages = parseTranscriptLines([
      assistant('a', [{ type: 'text', text: 'Reading' }, { type: 'tool_use', name: 'Read', input: { file_path: '/x.ts' } }])
    ])
    expect(messages.map((msg) => msg.id)).toEqual(['a:0', 'a:1'])
  })
})

describe('isTranscriptPath', () => {
  it('accepts only Claude project transcripts', () => {
    expect(isTranscriptPath('/home/u/.claude/projects/-home-u-app/abc.jsonl')).toBe(true)
    expect(isTranscriptPath('/home/u/.claude-cs/projects/-x/abc.jsonl')).toBe(true)
    expect(isTranscriptPath('/home/u/.ssh/projects/x/abc.jsonl')).toBe(false)
    expect(isTranscriptPath('/home/u/.claude/projects/x/abc.json')).toBe(false)
    expect(isTranscriptPath('relative/.claude/projects/x/abc.jsonl')).toBe(false)
  })
})

describe('readTranscript', () => {
  const session = '11111111-2222-3333-4444-555555555555'
  let root: string
  let file: string
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-'))
    m.dir = path.join(root, 'state')
    fs.mkdirSync(m.dir)
    const project = path.join(root, '.claude', 'projects', '-app')
    fs.mkdirSync(project, { recursive: true })
    file = path.join(project, 'conv.jsonl')
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
  const hook = (transcript: string): void =>
    fs.writeFileSync(path.join(m.dir, `${session}.json`), JSON.stringify({ hook_event_name: 'Stop', transcript_path: transcript }))

  it('is unavailable without a hook-reported transcript', () => {
    expect(readTranscript(session).available).toBe(false)
    hook('/etc/passwd')
    expect(readTranscript(session).available).toBe(false)
  })

  it('pages forward from a byte cursor and ignores a partial last line', () => {
    fs.writeFileSync(file, `${user('u1', 'one')}\n${assistant('a1', [{ type: 'text', text: 'two' }])}\n{"partial`)
    hook(file)
    const first = readTranscript(session)
    expect(first).toMatchObject({ available: true, transcriptId: 'conv', more: true })
    expect(first.messages.map((msg) => msg.text)).toEqual(['one', 'two'])
    fs.appendFileSync(file, `":1}\n${user('u2', 'three')}\n`)
    const next = readTranscript(session, first.offset, 'conv')
    expect(next.messages.map((msg) => msg.text)).toEqual(['three'])
    expect(next.more).toBe(false)
    expect(readTranscript(session, next.offset, 'conv').messages).toEqual([])
  })

  it('restarts from the tail when the transcript changes', () => {
    fs.writeFileSync(file, `${user('u1', 'one')}\n`)
    hook(file)
    const page = readTranscript(session, 999_999, 'old')
    expect(page.transcriptId).toBe('conv')
    expect(page.messages.map((msg) => msg.text)).toEqual(['one'])
  })
})
