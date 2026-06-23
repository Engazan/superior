import { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IPC, type AgentUsage } from '@shared/types'
import { encodeProjectDir, resolveClaudeConfigDir, statusDir } from './claude-paths'

/**
 * Live Claude usage tracking.
 *
 * When a terminal launches a Claude CLI, Claude Code writes a JSONL transcript
 * of the conversation under `<configDir>/projects/<encoded-cwd>/<session>.jsonl`,
 * one JSON object per line, with token counts on every assistant turn. We locate
 * that transcript from the session's command + cwd, tail it, and broadcast the
 * accumulated token/cost usage to the renderer's topbar.
 *
 * Nothing here parses the terminal's own output — the transcript is the reliable,
 * structured source, and it is the same data Claude Code bills against.
 *
 * Crucially, the config dir is derived from the *command*: a plain `claude` reads
 * `~/.claude`, while a custom-memory variant (`CLAUDE_CONFIG_DIR=$HOME/.claude-cs
 * claude`, or a bare `claude-cs` alias) reads `~/.claude-cs`. So `claude-cs`
 * usage is read from its own store and never conflated with plain `claude`.
 */

/** Re-read the transcript at most this often, even under a burst of fs events. */
const REFRESH_THROTTLE_MS = 400
/** Safety-net poll so we still pick up the transcript when fs.watch misses or the
 *  project dir doesn't exist yet at launch. */
const POLL_MS = 3000
/** A transcript file qualifies as this session's only if touched no earlier than
 *  this far before the session started (guards against clock skew). */
const MTIME_SLACK_MS = 15_000
/** Default context window; bumped to 1M only once we actually observe >200k. */
const DEFAULT_CONTEXT_LIMIT = 200_000
const LARGE_CONTEXT_LIMIT = 1_000_000

/** USD per million tokens, matched by substring against the model id. Order
 *  matters: the first match wins, so list more specific ids first. Estimates —
 *  pricing changes, and unknown models simply report a null cost. */
interface Price {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}
const MODEL_PRICING: Array<{ match: string; price: Price }> = [
  { match: 'opus', price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  { match: 'sonnet', price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: 'haiku', price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } }
]

function priceFor(model: string | null): Price | null {
  if (!model) return null
  const lower = model.toLowerCase()
  return MODEL_PRICING.find((p) => lower.includes(p.match))?.price ?? null
}

interface Totals {
  input: number
  output: number
  cacheRead: number
  cacheCreation: number
  contextTokens: number
  model: string | null
  messageCount: number
}

function emptyTotals(): Totals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    contextTokens: 0,
    model: null,
    messageCount: 0
  }
}

/** Fold one transcript line's usage into the running totals. */
function applyLine(totals: Totals, line: string): void {
  const text = line.trim()
  if (!text || text[0] !== '{') return
  let obj: {
    type?: string
    message?: { model?: string; usage?: Record<string, number> }
  }
  try {
    obj = JSON.parse(text)
  } catch {
    return
  }
  if (obj.type !== 'assistant') return
  const usage = obj.message?.usage
  if (!usage) return
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheCreation = usage.cache_creation_input_tokens ?? 0
  totals.input += input
  totals.output += output
  totals.cacheRead += cacheRead
  totals.cacheCreation += cacheCreation
  totals.messageCount += 1
  if (obj.message?.model) totals.model = obj.message.model
  // The latest turn's input (incl. cache) is the live context-window occupancy.
  totals.contextTokens = input + cacheRead + cacheCreation
}

/** The slice of Claude's status-line JSON we surface (rate limits + its own cost). */
interface StatusOverlay {
  fiveHourPct: number | null
  sevenDayPct: number | null
  resetsAt: string | null
  costUsd: number | null
  model: string | null
}

interface Tracker {
  id: string
  cwd: string
  configDir: string
  createdAt: number
  /** Resolved transcript dir for this cwd, cached once it exists. */
  projectDir: string | null
  /** The transcript file we're tailing, and how far we've consumed it. */
  filePath: string | null
  /** Basename of the transcript = Claude's session id, used to find the status file. */
  sessionId: string | null
  offset: number
  /** Trailing bytes past the last newline, kept so a line split across two reads
   *  (or a multi-byte char split across the read boundary) decodes intact. */
  remainder: Buffer
  totals: Totals
  /** Latest values read from the status-line file, or null until it appears. */
  status: StatusOverlay | null
  watchers: fs.FSWatcher[]
  poll: NodeJS.Timeout | null
  refreshTimer: NodeJS.Timeout | null
  refreshScheduled: boolean
  closed: boolean
}

const trackers = new Map<string, Tracker>()
/** Last emitted usage per session, so late-mounting renderers can be primed. */
const snapshots = new Map<string, AgentUsage>()

function broadcast(usage: AgentUsage): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.AGENT_USAGE, usage)
  }
}

function buildUsage(t: Tracker): AgentUsage {
  const { input, output, cacheRead, cacheCreation, contextTokens, model, messageCount } = t.totals
  const price = priceFor(model)
  const estimate = price
    ? (input * price.input +
        output * price.output +
        cacheCreation * price.cacheWrite +
        cacheRead * price.cacheRead) /
      1_000_000
    : null
  // Prefer Claude's own cost + model name from the status line when present.
  const costUsd = t.status?.costUsd ?? estimate
  return {
    id: t.id,
    model: t.status?.model ?? model,
    contextTokens,
    contextLimit: contextTokens > DEFAULT_CONTEXT_LIMIT ? LARGE_CONTEXT_LIMIT : DEFAULT_CONTEXT_LIMIT,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
    totalTokens: input + output + cacheRead + cacheCreation,
    costUsd,
    fiveHourPct: t.status?.fiveHourPct ?? null,
    sevenDayPct: t.status?.sevenDayPct ?? null,
    resetsAt: t.status?.resetsAt ?? null,
    messageCount,
    updatedAt: Date.now()
  }
}

/** Has anything the UI cares about changed since the last emit? */
function changed(prev: AgentUsage | undefined, next: AgentUsage): boolean {
  if (!prev) return true
  return (
    prev.totalTokens !== next.totalTokens ||
    prev.contextTokens !== next.contextTokens ||
    prev.messageCount !== next.messageCount ||
    prev.model !== next.model ||
    prev.costUsd !== next.costUsd ||
    prev.fiveHourPct !== next.fiveHourPct ||
    prev.sevenDayPct !== next.sevenDayPct
  )
}

/** Read a numeric percentage from a possibly-missing status field. */
function pct(value: unknown): number | null {
  return typeof value === 'number' && isFinite(value) ? value : null
}

/** Re-read this session's status-line file (rate limits + Claude's cost), if any. */
function readStatus(t: Tracker): void {
  if (!t.sessionId) return
  const file = path.join(statusDir(), `${t.sessionId}.json`)
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch {
    return // not written yet — keep whatever we had
  }
  let obj: {
    rate_limits?: {
      five_hour?: { used_percentage?: number; resets_at?: string }
      seven_day?: { used_percentage?: number }
    }
    cost?: { total_cost_usd?: number }
    model?: { display_name?: string }
  }
  try {
    obj = JSON.parse(raw)
  } catch {
    return
  }
  const rl = obj.rate_limits
  t.status = {
    fiveHourPct: pct(rl?.five_hour?.used_percentage),
    sevenDayPct: pct(rl?.seven_day?.used_percentage),
    resetsAt: typeof rl?.five_hour?.resets_at === 'string' ? rl.five_hour.resets_at : null,
    costUsd: pct(obj.cost?.total_cost_usd),
    model: obj.model?.display_name ?? null
  }
  ensureStatusWatch(t, file)
}

/** Resolve the transcript dir for this tracker's cwd, caching it once present. */
function projectDirFor(t: Tracker): string | null {
  if (t.projectDir && safeExists(t.projectDir)) return t.projectDir
  const root = path.join(t.configDir, 'projects')
  const direct = path.join(root, encodeProjectDir(t.cwd))
  if (safeExists(direct)) {
    t.projectDir = direct
    return direct
  }
  // Encoding mismatch fallback: find the subdir whose newest transcript reports
  // exactly this cwd. Only runs while the direct path is missing.
  try {
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name)
      const newest = newestJsonl(dir)
      if (newest && firstLineCwd(newest) === t.cwd) {
        t.projectDir = dir
        return dir
      }
    }
  } catch {
    /* projects root not created yet */
  }
  return null
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

/** The most recently modified `.jsonl` directly inside a dir, or null. */
function newestJsonl(dir: string): string | null {
  let best: { file: string; mtime: number } | null = null
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue
      const file = path.join(dir, name)
      try {
        const mtime = fs.statSync(file).mtimeMs
        if (!best || mtime > best.mtime) best = { file, mtime }
      } catch {
        /* file vanished mid-scan */
      }
    }
  } catch {
    /* dir gone */
  }
  return best?.file ?? null
}

function firstLineCwd(file: string): string | null {
  try {
    const head = fs.readFileSync(file, 'utf-8').slice(0, 8192)
    const line = head.split('\n', 1)[0]
    const obj = JSON.parse(line) as { cwd?: string }
    return obj.cwd ?? null
  } catch {
    return null
  }
}

/**
 * Pick this session's transcript: the newest `.jsonl` in its project dir that was
 * touched at/after the session started. "Newest" naturally follows the active
 * conversation, including after `/clear` starts a fresh transcript.
 */
function selectFile(t: Tracker): string | null {
  const dir = projectDirFor(t)
  if (!dir) return null
  let best: { file: string; mtime: number } | null = null
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue
      const file = path.join(dir, name)
      try {
        const mtime = fs.statSync(file).mtimeMs
        if (mtime < t.createdAt - MTIME_SLACK_MS) continue
        if (!best || mtime > best.mtime) best = { file, mtime }
      } catch {
        /* file vanished mid-scan */
      }
    }
  } catch {
    /* dir gone */
  }
  return best?.file ?? null
}

/** Read + fold any transcript bytes appended since the last refresh. */
function consume(t: Tracker): void {
  const selected = selectFile(t)
  if (!selected) return

  // A different (newer) transcript means a new conversation: start its totals
  // from scratch rather than carrying the previous one's numbers forward.
  if (selected !== t.filePath) {
    t.filePath = selected
    t.sessionId = path.basename(selected, '.jsonl')
    t.offset = 0
    t.remainder = Buffer.alloc(0)
    t.totals = emptyTotals()
    ensureFileWatch(t, selected)
  }

  let size: number
  try {
    size = fs.statSync(selected).size
  } catch {
    return
  }
  // The file was truncated/rotated under us — re-read from the top.
  if (size < t.offset) {
    t.offset = 0
    t.remainder = Buffer.alloc(0)
    t.totals = emptyTotals()
  }
  if (size === t.offset) return

  let chunk: Buffer
  try {
    const fd = fs.openSync(selected, 'r')
    try {
      const buf = Buffer.alloc(size - t.offset)
      fs.readSync(fd, buf, 0, buf.length, t.offset)
      chunk = buf
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return
  }
  t.offset = size

  // Split on newline bytes so multi-byte characters are never decoded across a
  // read boundary; only the trailing partial line is carried over.
  const data = t.remainder.length ? Buffer.concat([t.remainder, chunk]) : chunk
  let start = 0
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0x0a) continue
    applyLine(t.totals, data.toString('utf-8', start, i))
    start = i + 1
  }
  t.remainder = start < data.length ? data.subarray(start) : Buffer.alloc(0)
}

/** Consume new transcript + status bytes and emit if the visible numbers moved. */
function refresh(t: Tracker): void {
  if (t.closed) return
  consume(t)
  readStatus(t)
  // Stay hidden until there's something to show: a billed turn, or a rate-limit
  // reading from the status line (which can arrive before the first response).
  if (t.totals.messageCount === 0 && t.status?.fiveHourPct == null) return
  const usage = buildUsage(t)
  if (!changed(snapshots.get(t.id), usage)) return
  snapshots.set(t.id, usage)
  broadcast(usage)
}

function scheduleRefresh(t: Tracker): void {
  if (t.closed || t.refreshScheduled) return
  t.refreshScheduled = true
  t.refreshTimer = setTimeout(() => {
    t.refreshScheduled = false
    t.refreshTimer = null
    refresh(t)
  }, REFRESH_THROTTLE_MS)
}

/** Watch the project dir for new/rotated transcripts (best-effort; poll backs it up). */
function ensureDirWatch(t: Tracker): void {
  const dir = t.projectDir
  if (!dir || t.watchers.some((w) => (w as { dir?: string }).dir === dir)) return
  try {
    const watcher = fs.watch(dir, () => scheduleRefresh(t))
    ;(watcher as { dir?: string }).dir = dir
    t.watchers.push(watcher)
  } catch {
    /* watch unsupported here — poll covers it */
  }
}

/** Watch the specific transcript file for appends. */
function ensureFileWatch(t: Tracker, file: string): void {
  if (t.watchers.some((w) => (w as { file?: string }).file === file)) return
  try {
    const watcher = fs.watch(file, () => scheduleRefresh(t))
    ;(watcher as { file?: string }).file = file
    t.watchers.push(watcher)
  } catch {
    /* poll covers it */
  }
}

/** Watch the status-line file the wrapper writes for this session. */
function ensureStatusWatch(t: Tracker, file: string): void {
  if (t.watchers.some((w) => (w as { status?: string }).status === file)) return
  try {
    const watcher = fs.watch(file, () => scheduleRefresh(t))
    ;(watcher as { status?: string }).status = file
    t.watchers.push(watcher)
  } catch {
    /* poll covers it */
  }
}

/**
 * Begin tracking usage for a session, if its command runs a Claude CLI. A no-op
 * for any other command, and idempotent per session id.
 */
export function startUsageTracking(args: {
  id: string
  cwd: string
  command: string
  createdAt: number
}): void {
  if (trackers.has(args.id)) return
  const configDir = resolveClaudeConfigDir(args.command)
  if (!configDir || !args.cwd) return

  const tracker: Tracker = {
    id: args.id,
    cwd: args.cwd,
    configDir,
    createdAt: args.createdAt,
    projectDir: null,
    filePath: null,
    sessionId: null,
    offset: 0,
    remainder: Buffer.alloc(0),
    totals: emptyTotals(),
    status: null,
    watchers: [],
    poll: null,
    refreshTimer: null,
    refreshScheduled: false,
    closed: false
  }
  trackers.set(args.id, tracker)

  // Poll drives discovery (project dir / transcript may not exist yet) and backs
  // up fs.watch; each tick also (re)establishes watches once paths appear.
  tracker.poll = setInterval(() => {
    if (tracker.closed) return
    ensureDirWatch(tracker)
    refresh(tracker)
  }, POLL_MS)
  refresh(tracker)
  ensureDirWatch(tracker)
}

/**
 * Stop tracking a session. Does a final read so the badge reflects the last turn,
 * and keeps the snapshot so the UI can keep showing the final usage after exit.
 */
export function stopUsageTracking(id: string): void {
  const t = trackers.get(id)
  if (!t) return
  refresh(t) // final read so the badge reflects the last turn — before we close
  t.closed = true
  if (t.poll) clearInterval(t.poll)
  if (t.refreshTimer) clearTimeout(t.refreshTimer)
  for (const w of t.watchers) {
    try {
      w.close()
    } catch {
      /* already closed */
    }
  }
  trackers.delete(id)
}

/** Stop every tracker and drop all snapshots — used when usage tracking is
 *  switched off. The badges clear once the renderer empties its store. */
export function stopAllUsageTracking(): void {
  for (const t of trackers.values()) {
    t.closed = true
    if (t.poll) clearInterval(t.poll)
    if (t.refreshTimer) clearTimeout(t.refreshTimer)
    for (const w of t.watchers) {
      try {
        w.close()
      } catch {
        /* already closed */
      }
    }
  }
  trackers.clear()
  snapshots.clear()
}

/** Current usage snapshots, to prime a freshly-loaded renderer. */
export function getUsageSnapshots(): AgentUsage[] {
  return [...snapshots.values()]
}
