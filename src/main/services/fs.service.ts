import { open, readdir, stat } from 'fs/promises'
import { join, sep } from 'path'
import type { FileReadOptions, FileReadResult, FsEntry, FsListResult } from '@shared/types'
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
  let size: number
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return { ...EMPTY_READ, error: 'Not a file.' }
    }
    size = info.size
  } catch (err) {
    return { ...EMPTY_READ, error: (err as Error).message }
  }

  if (!opts.read) {
    return { ...EMPTY_READ, size, truncated: size > opts.maxBytes }
  }

  // Base64 (images): only when the whole file fits, otherwise fall back.
  if (opts.asBase64) {
    if (size > opts.maxBytes) {
      return { ...EMPTY_READ, size, truncated: true }
    }
    try {
      const fh = await open(filePath, 'r')
      try {
        const buf = await fh.readFile()
        return { size, truncated: false, encoding: 'base64', content: buf.toString('base64'), isBinary: true }
      } finally {
        await fh.close()
      }
    } catch (err) {
      return { ...EMPTY_READ, size, error: (err as Error).message }
    }
  }

  // Text: read at most maxBytes; mark truncated when the file is larger.
  const toRead = Math.min(size, opts.maxBytes)
  try {
    const fh = await open(filePath, 'r')
    try {
      const buf = Buffer.alloc(toRead)
      const { bytesRead } = await fh.read(buf, 0, toRead, 0)
      const slice = buf.subarray(0, bytesRead)
      return {
        size,
        truncated: size > opts.maxBytes,
        encoding: 'utf8',
        content: slice.toString('utf8'),
        isBinary: slice.includes(0)
      }
    } finally {
      await fh.close()
    }
  } catch (err) {
    return { ...EMPTY_READ, size, error: (err as Error).message }
  }
}
