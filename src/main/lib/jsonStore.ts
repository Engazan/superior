import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/** Absolute path to a JSON file in the app's userData directory. */
export function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name)
}

/**
 * Read and JSON-parse a file, returning `fallback` when it's missing, unreadable,
 * malformed, or rejected by the optional `validate` guard. Never throws.
 */
export function readJsonFile<T>(
  file: string,
  fallback: T,
  validate?: (parsed: unknown) => T | null
): T {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch {
    return fallback // missing/unreadable — expected on first run
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // The file exists but isn't valid JSON — almost always a torn write. Preserve
    // it so the caller's next save can't overwrite recoverable data with defaults.
    if (raw.trim()) {
      try {
        fs.renameSync(file, `${file}.corrupt`)
      } catch {
        /* best effort */
      }
    }
    return fallback
  }
  if (!validate) return parsed as T
  const checked = validate(parsed)
  return checked === null ? fallback : checked
}

/**
 * Pretty-print `value` to `file`, logging (never throwing) on failure. Writes to
 * a temp file and atomically renames it over the target so a crash or a
 * concurrent read never observes a half-written (and thus corrupt) file.
 */
export function writeJsonFile(file: string, value: unknown, label: string): void {
  const tmp = `${file}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
  } catch (err) {
    console.error(`[${label}] failed to persist:`, err)
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      /* best effort */
    }
  }
}
