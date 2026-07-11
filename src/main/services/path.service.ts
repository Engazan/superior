import * as fs from 'fs'
import * as path from 'path'

/** True if the path exists and is a directory. */
export function isValidWorkspaceDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

/** Canonical absolute path with symlinks resolved; falls back to a plain resolve
 * for paths that don't exist yet (the subsequent operation fails on its own). */
export function canonicalPath(value: string): string {
  try {
    return fs.realpathSync(path.resolve(value))
  } catch {
    return path.resolve(value)
  }
}
