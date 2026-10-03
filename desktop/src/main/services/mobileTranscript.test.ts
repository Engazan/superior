import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const m = vi.hoisted(() => ({ dir: '' }))
vi.mock('./agent-state.service', () => ({ agentStateDir: () => m.dir }))

import {
  isCodexTranscriptPath,
  isTranscriptPath,
  parseCodexLines,
  parseTranscriptLines,
  readTranscript
} from './mobileTranscript'

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

const codexItem = (item: object): string =>
  line({ timestamp: '2026-10-02T10:00:00.000Z', type: 'event_msg', payload: { type: 'item_completed', item } })

describe('parseCodexLines', () => {
  it('keeps user and agent messages and summarizes tools from completed items', () => {
    const messages = parseCodexLines([
      line({ type: 'session_meta', payload: { id: 't' } }),
      line({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions' }] } }),
      codexItem({ type: 'UserMessage', id: 'u', content: [{ type: 'text', text: 'Add a tab' }] }),
      codexItem({ type: 'Reasoning', id: 'r', summary_text: [] }),
      codexItem({ type: 'CommandExecution', id: 'c', command: ['/bin/zsh', '-lc', 'rg   --files'] }),
      codexItem({ type: 'Extension', id: 'w', kind: 'web.search', query: 'expo tabs' }),
      codexItem({ type: 'FileChange', id: 'f', changes: [{ path: '/a.ts' }, { path: '/b.ts' }] }),
      codexItem({ type: 'AgentMessage', id: 'a', content: [{ type: 'Text', text: 'Done.' }] })
    ])
    expect(messages.map(({ role, tool, text }) => [role, tool, text])).toEqual([
      ['user', undefined, 'Add a tab'],
      ['tool', 'Shell', 'rg --files'],
      ['tool', 'WebSearch', 'expo tabs'],
      ['tool', 'Edit', '/a.ts, /b.ts'],
      ['assistant', undefined, 'Done.']
    ])
  })
})

describe('isCodexTranscriptPath', () => {
  it('accepts only rollouts inside a Codex sessions folder', () => {
    expect(isCodexTranscriptPath('/home/u/.codex/sessions/2026/10/02/rollout-x-1.jsonl')).toBe(true)
    expect(isCodexTranscriptPath('/home/u/.codex/archived_sessions/rollout-x-1.jsonl')).toBe(true)
    expect(isCodexTranscriptPath('/home/u/.codex/sessions/2026/10/02/other.jsonl')).toBe(false)
    expect(isCodexTranscriptPath('/home/u/notes/sessions/rollout-x.jsonl')).toBe(false)
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

  it('finds a Codex rollout by the hook session id when no path is reported', () => {
    const thread = '01a0b356-2994-7de3-829d-9277e1c56718'
    const now = new Date()
    const day = path.join(
      root,
      '.codex',
      'sessions',
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    )
    fs.mkdirSync(day, { recursive: true })
    fs.writeFileSync(
      path.join(day, `rollout-2026-10-02T10-00-00-${thread}.jsonl`),
      `${codexItem({ type: 'UserMessage', id: 'u', content: [{ type: 'text', text: 'hi' }] })}\n`
    )
    vi.stubEnv('CODEX_HOME', path.join(root, '.codex'))
    fs.writeFileSync(path.join(m.dir, `${session}.json`), JSON.stringify({ hook_event_name: 'Stop', session_id: thread }))
    const page = readTranscript(session)
    vi.unstubAllEnvs()
    expect(page.available).toBe(true)
    expect(page.messages.map((msg) => msg.text)).toEqual(['hi'])
  })

  it('restarts from the tail when the transcript changes', () => {
    fs.writeFileSync(file, `${user('u1', 'one')}\n`)
    hook(file)
    const page = readTranscript(session, 999_999, 'old')
    expect(page.transcriptId).toBe('conv')
    expect(page.messages.map((msg) => msg.text)).toEqual(['one'])
  })
})
