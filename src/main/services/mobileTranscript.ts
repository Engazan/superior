import * as fs from 'fs'
import * as path from 'path'
import type { MobileChatMessage, MobileTranscript } from '@shared/mobileRelay'
import { agentStateDir } from './agent-state.service'

/**
 * Turns a Claude transcript (JSONL) into chat messages for the mobile app.
 *
 * The terminal's Claude hook payload (see agent-state.service) names the exact
 * `transcript_path`, so no cwd guessing is needed. Only files that look like a
 * Claude transcript (`<config>/projects/<dir>/<id>.jsonl`) are ever read.
 */

const TAIL_BYTES = 256_000
const CHUNK_BYTES = 512_000
const PAGE_BYTES = 48_000
const TEXT_MAX = 6_000
const SUMMARY_MAX = 200
const SUMMARY_KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt']

type Block = { type?: unknown; text?: unknown; name?: unknown; input?: unknown }
type Entry = {
  type?: unknown
  uuid?: unknown
  timestamp?: unknown
  isMeta?: unknown
  isSidechain?: unknown
  message?: { content?: unknown }
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function toolSummary(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  for (const key of SUMMARY_KEYS) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim())
      return clip(value.trim().replace(/\s+/g, ' '), SUMMARY_MAX)
  }
  return ''
}

/** What a person typed, without the wrappers Claude adds around slash commands and reminders. */
function userText(raw: string): string | null {
  const text = raw.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
  const command = /<command-name>([\s\S]*?)<\/command-name>/.exec(text)
  if (command) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim()
    return [command[1].trim(), args].filter(Boolean).join(' ')
  }
  if (!text || /^<(local-command|command-|bash-|user-memory)/.test(text)) return null
  return text
}

/** Pure: map raw JSONL lines to chat messages (main conversation only, no thinking or tool output). */
export function parseTranscriptLines(lines: string[]): MobileChatMessage[] {
  const out: MobileChatMessage[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    let entry: Entry
    try {
      entry = JSON.parse(line) as Entry
    } catch {
      continue
    }
    if (entry.type !== 'user' && entry.type !== 'assistant') continue
    if (entry.isMeta === true || entry.isSidechain === true) continue
    const id = typeof entry.uuid === 'string' ? entry.uuid : String(out.length)
    const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) || 0 : 0
    const content = entry.message?.content
    const blocks: Block[] = typeof content === 'string'
      ? [{ type: 'text', text: content }]
      : Array.isArray(content) ? (content as Block[]) : []
    blocks.forEach((block, i) => {
      const key = blocks.length > 1 ? `${id}:${i}` : id
      if (block.type === 'text' && typeof block.text === 'string') {
        const text = entry.type === 'user' ? userText(block.text) : block.text.trim()
        if (text) out.push({ id: key, role: entry.type as 'user' | 'assistant', text: clip(text, TEXT_MAX), at })
      } else if (block.type === 'tool_use' && entry.type === 'assistant') {
        out.push({
          id: key,
          role: 'tool',
          tool: typeof block.name === 'string' ? clip(block.name, 80) : 'tool',
          text: toolSummary(block.input),
          at
        })
      }
    })
  }
  return out
}

/** Accept only `<config>/projects/<dir>/<file>.jsonl` under a `.claude*` config dir. */
export function isTranscriptPath(file: string): boolean {
  if (!path.isAbsolute(file) || path.extname(file) !== '.jsonl') return false
  const project = path.dirname(file)
  const projects = path.dirname(project)
  return path.basename(projects) === 'projects' && path.basename(path.dirname(projects)).startsWith('.claude')
}

function transcriptPath(sessionId: string): string | null {
  try {
    const hook = JSON.parse(fs.readFileSync(path.join(agentStateDir(), `${sessionId}.json`), 'utf-8')) as {
      transcript_path?: unknown
    }
    if (typeof hook.transcript_path !== 'string') return null
    const real = fs.realpathSync(hook.transcript_path)
    return isTranscriptPath(hook.transcript_path) && isTranscriptPath(real) ? real : null
  } catch {
    return null
  }
}

const EMPTY: MobileTranscript = { available: false, transcriptId: null, messages: [], offset: 0, more: false }

/**
 * Read the next page of a session's transcript. Without an offset (or for a
 * different transcript) it starts near the end so long sessions open fast.
 */
export function readTranscript(sessionId: string, offset?: number, transcriptId?: string): MobileTranscript {
  const file = transcriptPath(sessionId)
  if (!file) return EMPTY
  const id = path.basename(file, '.jsonl')
  let size: number
  try {
    size = fs.statSync(file).size
  } catch {
    return EMPTY
  }
  const fresh = offset === undefined || transcriptId !== id || offset > size
  let start = fresh ? Math.max(0, size - TAIL_BYTES) : offset
  const end = Math.min(size, start + CHUNK_BYTES)
  if (end <= start) return { available: true, transcriptId: id, messages: [], offset: start, more: false }
  const buffer = Buffer.alloc(end - start)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, buffer, 0, buffer.length, start)
  } finally {
    fs.closeSync(fd)
  }
  let text = buffer.toString('utf-8')
  if (fresh && start > 0) {
    // Started mid-line: skip to the first complete one.
    const first = text.indexOf('\n')
    if (first < 0) return { available: true, transcriptId: id, messages: [], offset: start, more: end < size }
    start += Buffer.byteLength(text.slice(0, first + 1))
    text = text.slice(first + 1)
  }
  const messages: MobileChatMessage[] = []
  let cursor = start
  let bytes = 0
  for (const line of text.split('\n').slice(0, -1)) {
    const parsed = parseTranscriptLines([line])
    const weight = parsed.reduce((sum, m) => sum + Buffer.byteLength(JSON.stringify(m)), 0)
    if (bytes + weight > PAGE_BYTES && messages.length) break
    messages.push(...parsed)
    bytes += weight
    cursor += Buffer.byteLength(line) + 1
  }
  // A single line longer than the chunk: skip past it rather than stalling.
  if (cursor === start && end < size) cursor = end
  return { available: true, transcriptId: id, messages, offset: cursor, more: cursor < size }
}
