import { open, readdir, stat, writeFile } from 'fs/promises'
import { isAbsolute, join, normalize, resolve, sep } from 'path'
import { homedir } from 'os'
import type {
  FileLinkTarget,
  FileContentMatch,
  FileContentSearchResult,
  FileReadOptions,
  FileReadResult,
  FileWriteResult,
  FsEntry,
  FsListResult
} from '@shared/types'
import { isWithinWorkspaceFolder } from './workspace.service'

// Hidden plumbing the file tree should never surface.
const IGNORED = new Set(['.git'])

const OUTSIDE_WORKSPACE = 'Path is outside the opened workspace folders.'

/**
 * List the immediate children of a directory (one level), sorted with folders
 * first then alphabetically. The tree loads levels lazily as they expand.
 */
export async function listDir(dirPath: string): Promise<FsListResult> {
  if (!isWithinWorkspaceFolder(dirPath)) return { entries: [], error: OUTSIDE_WORKSPACE }
  try {
    const dirents = await readdir(dirPath, { withFileTypes: true })
    const entries = dirents
      .filter((d) => !IGNORED.has(d.name))
      .map((d) => ({
        name: d.name,
        path: join(dirPath, d.name),
        isDirectory: d.isDirectory()
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    return { entries }
  } catch (err) {
    return { entries: [], error: (err as Error).message }
  }
}

// Heavy/irrelevant directories are skipped when searching the whole tree.
const SEARCH_IGNORED = new Set(['.git', 'node_modules'])
const MAX_RESULTS = 300
const MAX_VISITED = 50_000

const CONTENT_MAX_RESULTS = 300
const CONTENT_MAX_VISITED = 20_000
const CONTENT_MAX_FILE_BYTES = 2 * 1024 * 1024
const CONTENT_PREVIEW_LENGTH = 240
const CONTENT_CONTEXT_LINES = 10
const CONTENT_MATCH_CONTEXT_INDEX = 3

/**
 * Recursively find files whose relative path contains every whitespace-separated
 * query part (case-insensitive). Parts may match independently anywhere in the
 * path, so `langs configuration` can match `langs/app/configuration.json`.
 * Caps results and files visited so huge trees stay fast; `truncated` flags an
 * early stop.
 */
export async function searchFiles(rootPath: string, query: string): Promise<FsListResult> {
  if (!isWithinWorkspaceFolder(rootPath)) return { entries: [], error: OUTSIDE_WORKSPACE }
  const queryParts = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!queryParts.length) return { entries: [] }

  const results: FsEntry[] = []
  const stack: string[] = [rootPath]
  let visited = 0
  let truncated = false

  try {
    while (stack.length && results.length < MAX_RESULTS && visited < MAX_VISITED) {
      const dir = stack.pop() as string
      let dirents
      try {
        dirents = await readdir(dir, { withFileTypes: true })
      } catch {
        continue // unreadable dir — skip it
      }
      for (const d of dirents) {
        if (d.isDirectory()) {
          if (!SEARCH_IGNORED.has(d.name)) stack.push(join(dir, d.name))
          continue
        }
        if (!d.isFile()) continue
        if (++visited >= MAX_VISITED) {
          truncated = true
          break
        }
        const full = join(dir, d.name)
        const rel = full.slice(rootPath.length + 1).toLowerCase()
        if (queryParts.every((part) => rel.includes(part))) {
          results.push({ name: d.name, path: full, isDirectory: false })
          if (results.length >= MAX_RESULTS) {
            truncated = true
            break
          }
        }
      }
    }

    // Shallower paths first, then alphabetical by name.
    results.sort((a, b) => {
      const depth = a.path.split(sep).length - b.path.split(sep).length
      return depth !== 0 ? depth : a.name.localeCompare(b.name)
    })
    return { entries: results, truncated }
  } catch (err) {
    return { entries: [], error: (err as Error).message }
  }
}

/** Build a bounded, single-line preview while retaining the match offset. */
function contentMatchPreview(
  line: string,
  matchIndex: number,
  matchLength: number
): Pick<FileContentMatch, 'preview' | 'matchStart' | 'matchLength'> {
  if (line.length <= CONTENT_PREVIEW_LENGTH) {
    return { preview: line, matchStart: matchIndex, matchLength }
  }

  const context = Math.max(0, Math.floor((CONTENT_PREVIEW_LENGTH - matchLength) / 2))
  const start = Math.max(0, Math.min(matchIndex - context, line.length - CONTENT_PREVIEW_LENGTH))
  const end = Math.min(line.length, start + CONTENT_PREVIEW_LENGTH)
  const leading = start > 0 ? '…' : ''
  const trailing = end < line.length ? '…' : ''
  return {
    preview: `${leading}${line.slice(start, end)}${trailing}`,
    matchStart: leading.length + matchIndex - start,
    matchLength
  }
}

/** Bound a non-matching context row without shifting its source position. */
function boundedContextLine(line: string): string {
  if (line.length <= CONTENT_PREVIEW_LENGTH) return line
  return `${line.slice(0, CONTENT_PREVIEW_LENGTH - 1)}…`
}

/**
 * Build ten preview rows with the hit pinned to the fourth row. Missing source
 * rows near the start/end of a file become explicit padding, keeping the UI
 * stable and the match position deterministic.
 */
function contentContextLines(
  lines: string[],
  matchLineIndex: number,
  matchPreview: string
): FileContentMatch['contextLines'] {
  return Array.from({ length: CONTENT_CONTEXT_LINES }, (_, contextIndex) => {
    const sourceIndex = matchLineIndex - CONTENT_MATCH_CONTEXT_INDEX + contextIndex
    if (sourceIndex < 0 || sourceIndex >= lines.length) return { line: null, text: '' }
    return {
      line: sourceIndex + 1,
      text: sourceIndex === matchLineIndex ? matchPreview : boundedContextLine(lines[sourceIndex])
    }
  })
}

/**
 * Search bounded UTF-8 text files for a literal, case-insensitive query and
 * return one result per matching line with enough context for an inline preview.
 */
export async function searchFileContents(
  rootPath: string,
  query: string
): Promise<FileContentSearchResult> {
  if (!isWithinWorkspaceFolder(rootPath)) return { matches: [], error: OUTSIDE_WORKSPACE }
  const needle = query.trim().toLowerCase()
  if (!needle) return { matches: [] }

  const matches: FileContentMatch[] = []
  const stack: string[] = [rootPath]
  let visited = 0
  let truncated = false

  try {
    while (
      stack.length &&
      matches.length < CONTENT_MAX_RESULTS &&
      visited < CONTENT_MAX_VISITED
    ) {
      const dir = stack.pop() as string
      let dirents
      try {
        dirents = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of dirents) {
        if (entry.isDirectory()) {
          if (!SEARCH_IGNORED.has(entry.name)) stack.push(join(dir, entry.name))
          continue
        }
        if (!entry.isFile()) continue
        visited += 1
        if (visited >= CONTENT_MAX_VISITED) {
          truncated = true
          break
        }

        const full = join(dir, entry.name)
        let info
        try {
          info = await stat(full)
        } catch {
          continue
        }
        if (info.size > CONTENT_MAX_FILE_BYTES) continue

        let buffer: Buffer
        try {
          const file = await open(full, 'r')
          try {
            // Read only the size already approved above. The file may grow
            // between stat and read, but a search must remain bounded.
            const allocation = Buffer.alloc(info.size)
            const { bytesRead } = await file.read(allocation, 0, info.size, 0)
            buffer = allocation.subarray(0, bytesRead)
          } finally {
            await file.close()
          }
        } catch {
          continue
        }
        if (buffer.includes(0)) continue

        const lines = buffer.toString('utf8').split(/\r?\n/)
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          const line = lines[lineIndex]
          const matchIndex = line.toLowerCase().indexOf(needle)
          if (matchIndex < 0) continue
          const preview = contentMatchPreview(line, matchIndex, needle.length)
          matches.push({
            name: entry.name,
            path: full,
            line: lineIndex + 1,
            column: matchIndex + 1,
            ...preview,
            contextLines: contentContextLines(lines, lineIndex, preview.preview)
          })
          if (matches.length >= CONTENT_MAX_RESULTS) {
            truncated = true
            break
          }
        }
        if (matches.length >= CONTENT_MAX_RESULTS) break
      }
    }

    matches.sort((a, b) => {
      const pathOrder = a.path.localeCompare(b.path)
      return pathOrder !== 0 ? pathOrder : a.line - b.line
    })
    return { matches, truncated }
  } catch (err) {
    return { matches: [], error: (err as Error).message }
  }
}

const EMPTY_READ: FileReadResult = {
  size: 0,
  truncated: false,
  encoding: 'none',
  content: '',
  isBinary: false
}

/** A renderer request must never turn the preview bridge into an unbounded read. */
const MAX_PREVIEW_BYTES = 10 * 1024 * 1024

function normalizeReadOptions(value: unknown): Required<FileReadOptions> {
  const raw = value && typeof value === 'object' ? (value as Partial<FileReadOptions>) : {}
  const maxBytes =
    typeof raw.maxBytes === 'number' && Number.isFinite(raw.maxBytes)
      ? Math.min(MAX_PREVIEW_BYTES, Math.max(0, Math.floor(raw.maxBytes)))
      : 0
  return { maxBytes, asBase64: raw.asBase64 === true, read: raw.read === true }
}

/**
 * Read a file for preview without ever modifying it. Reads at most
 * `opts.maxBytes`; for binary/base64 reads larger than the limit nothing is
 * loaded (the caller shows a fallback). Text reads are capped and flagged as
 * truncated so huge files never get pulled fully into memory.
 */
export async function readFilePreview(
  filePath: string,
  opts: FileReadOptions
): Promise<FileReadResult> {
  if (!isWithinWorkspaceFolder(filePath)) return { ...EMPTY_READ, error: OUTSIDE_WORKSPACE }
  const options = normalizeReadOptions(opts)
  let size: number
  let mtimeMs: number
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return { ...EMPTY_READ, error: 'Not a file.' }
    }
    size = info.size
    mtimeMs = info.mtimeMs
  } catch (err) {
    return { ...EMPTY_READ, error: (err as Error).message }
  }

  if (!options.read) {
    return { ...EMPTY_READ, size, mtimeMs, truncated: size > options.maxBytes }
  }

  // Base64 (images): only when the whole file fits, otherwise fall back.
  if (options.asBase64) {
    if (size > options.maxBytes) {
      return { ...EMPTY_READ, size, mtimeMs, truncated: true }
    }
    try {
      const fh = await open(filePath, 'r')
      try {
        // Read exactly the validated size: the file can grow after stat, but a
        // preview request must still remain bounded by its approved allocation.
        const buf = Buffer.alloc(size)
        const { bytesRead } = await fh.read(buf, 0, size, 0)
        const slice = buf.subarray(0, bytesRead)
        return {
          size,
          mtimeMs,
          truncated: false,
          encoding: 'base64',
          content: slice.toString('base64'),
          isBinary: true
        }
      } finally {
        await fh.close()
      }
    } catch (err) {
      return { ...EMPTY_READ, size, mtimeMs, error: (err as Error).message }
    }
  }

  // Text: read at most maxBytes; mark truncated when the file is larger.
  const toRead = Math.min(size, options.maxBytes)
  try {
    const fh = await open(filePath, 'r')
    try {
      const buf = Buffer.alloc(toRead)
      const { bytesRead } = await fh.read(buf, 0, toRead, 0)
      const slice = buf.subarray(0, bytesRead)
      return {
        size,
        mtimeMs,
        truncated: size > options.maxBytes,
        encoding: 'utf8',
        content: slice.toString('utf8'),
        isBinary: slice.includes(0)
      }
    } finally {
      await fh.close()
    }
  } catch (err) {
    return { ...EMPTY_READ, size, mtimeMs, error: (err as Error).message }
  }
}

/**
 * Overwrite an existing file with edited preview content (UTF-8). Refuses paths
 * outside the workspace and anything that isn't a regular file, so the preview
 * editor can never create or clobber arbitrary locations. The renderer only
 * enables editing for non-truncated text files, so a full overwrite is safe.
 */
export async function writeFilePreview(
  filePath: string,
  content: string
): Promise<FileWriteResult> {
  if (!isWithinWorkspaceFolder(filePath)) return { ok: false, error: OUTSIDE_WORKSPACE }
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return { ok: false, error: 'Not a file.' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    await writeFile(filePath, content, 'utf8')
    const info = await stat(filePath)
    return { ok: true, size: info.size }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Resolve a path-like token from terminal output into an existing file.
 *
 * Accepts absolute, `~/`, and cwd-relative paths with an optional
 * `:line[:column]` suffix, trims surrounding punctuation that commonly wraps
 * paths in program output, and only ever resolves to a regular file inside an
 * opened workspace folder — the same containment rule every other fs entry
 * point enforces. Returns null when the token doesn't name an existing file,
 * so the renderer never underlines dead links.
 */
export async function resolveFileLink(
  cwd: string | null,
  rawToken: string
): Promise<FileLinkTarget | null> {
  // Strip wrapping quotes/brackets and trailing punctuation: "(src/a.ts:3)." → "src/a.ts:3"
  let token = rawToken.trim().replace(/^["'`([{<]+/, '').replace(/["'`)\]}>.,;:]+$/, '')
  if (!token) return null

  // Peel off a trailing :line[:col] (a bare drive letter like C: survives via
  // the length check on what remains).
  let line: number | undefined
  let column: number | undefined
  const pos = token.match(/^(.*?):(\d+)(?::(\d+))?$/)
  if (pos && pos[1].length > 1) {
    token = pos[1]
    line = Number(pos[2])
    column = pos[3] ? Number(pos[3]) : undefined
  }

  if (token.startsWith('~/')) token = join(homedir(), token.slice(2))

  let candidate: string
  if (isAbsolute(token)) {
    candidate = normalize(token)
  } else if (cwd) {
    candidate = resolve(cwd, token)
  } else {
    return null
  }

  if (!isWithinWorkspaceFolder(candidate)) return null
  try {
    const info = await stat(candidate)
    if (!info.isFile()) return null
  } catch {
    return null
  }
  return { path: candidate, line, column }
}
