import { open, readdir, stat } from 'fs/promises'
import { join } from 'path'
import type { FileReadOptions, FileReadResult, FsListResult } from '@shared/types'

// Hidden plumbing the file tree should never surface.
const IGNORED = new Set(['.git'])

/**
 * List the immediate children of a directory (one level), sorted with folders
 * first then alphabetically. The tree loads levels lazily as they expand.
 */
export async function listDir(dirPath: string): Promise<FsListResult> {
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
