import { open, readdir, stat, writeFile } from 'fs/promises'
import { isAbsolute, join, normalize, resolve, sep } from 'path'
import { homedir } from 'os'
import type {
  FileLinkTarget,
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

/**
 * Recursively find files whose name or relative path contains `query`
 * (case-insensitive). Caps results and files visited so huge trees stay fast;
 * `truncated` flags an early stop.
 */
export async function searchFiles(rootPath: string, query: string): Promise<FsListResult> {
  if (!isWithinWorkspaceFolder(rootPath)) return { entries: [], error: OUTSIDE_WORKSPACE }
  const q = query.trim().toLowerCase()
  if (!q) return { entries: [] }

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
        const rel = full.slice(rootPath.length + 1)
        if (d.name.toLowerCase().includes(q) || rel.toLowerCase().includes(q)) {
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
