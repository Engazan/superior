import { constants } from 'fs'
import { lstat, open } from 'fs/promises'
import { isAbsolute, relative, resolve, sep } from 'path'

/** Never load more than this many bytes for one untracked file into a Git view. */
export const MAX_UNTRACKED_BYTES = 512 * 1024

/**
 * Read a small, regular untracked file without following symlinks or escaping
 * the repository root. `git status` supplies relative paths, but treat that
 * output as filesystem input: a malicious or racy worktree must not make the
 * Git panel read an arbitrary file elsewhere on disk.
 *
 * The file is sized before allocating its buffer and read through an already
 * opened descriptor, so a large file never becomes one large `readFile` buffer.
 */
export async function readUntrackedFile(root: string, filePath: string): Promise<Buffer | null> {
  const candidate = resolve(root, filePath)
  const rel = relative(root, candidate)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null

  try {
    // A symlink can lead outside the workspace. Check it before opening and use
    // O_NOFOLLOW where the platform supports it to close the check/open gap.
    const before = await lstat(candidate)
    if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_UNTRACKED_BYTES) {
      return null
    }

    const flags =
      process.platform === 'win32'
        ? constants.O_RDONLY
        : constants.O_RDONLY | constants.O_NOFOLLOW
    const file = await open(candidate, flags)
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > MAX_UNTRACKED_BYTES) return null

      const buffer = Buffer.alloc(info.size)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      return buffer.subarray(0, bytesRead)
    } finally {
      await file.close()
    }
  } catch {
    // Files can disappear or change type while Git's view is being built.
    return null
  }
}
