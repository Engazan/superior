import { readdir } from 'fs/promises'
import { join } from 'path'
import type { FsListResult } from '@shared/types'

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
