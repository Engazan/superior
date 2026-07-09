import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * xterm's built-in paste is text-only, so an image on the clipboard never
 * reaches the pty (and thus the agent) the way it does in a native terminal.
 * We bridge the gap: the renderer hands us the pasted image bytes, we drop them
 * into a temp file, and the caller inserts that path into the terminal so the
 * agent (Claude/Codex) can read it — mirroring a drag-and-drop of the file.
 */
const IMAGE_DIR = join(tmpdir(), 'superior-pasted-images')

// Keep the temp dir from growing without bound across a long session: newest
// files win, anything past this count is pruned on the next paste.
const MAX_KEPT = 50

const EXT_RE = /^[a-z0-9]+$/i

/** Persist clipboard image bytes to a temp file and return its absolute path. */
export async function saveClipboardImage(
  bytes: Uint8Array,
  ext: string
): Promise<{ path: string }> {
  await fs.mkdir(IMAGE_DIR, { recursive: true })
  await pruneOldImages()
  const safeExt = EXT_RE.test(ext) ? ext.toLowerCase() : 'png'
  const name = `pasted-${Date.now()}-${counter()}.${safeExt}`
  const filePath = join(IMAGE_DIR, name)
  await fs.writeFile(filePath, Buffer.from(bytes))
  return { path: filePath }
}

let seq = 0
// A monotonic suffix so two pastes within the same millisecond never collide.
function counter(): string {
  seq = (seq + 1) % 1_000_000
  return seq.toString(36)
}

async function pruneOldImages(): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(IMAGE_DIR)
  } catch {
    return
  }
  if (entries.length <= MAX_KEPT) return
  // Names embed a monotonic `Date.now()`, so a lexical sort is chronological —
  // no per-file stat needed. Drop everything but the newest MAX_KEPT.
  entries.sort()
  const stale = entries.slice(0, entries.length - MAX_KEPT)
  await Promise.all(stale.map((name) => fs.rm(join(IMAGE_DIR, name), { force: true })))
}
