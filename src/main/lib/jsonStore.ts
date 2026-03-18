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
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (!validate) return parsed as T
    const checked = validate(parsed)
    return checked === null ? fallback : checked
  } catch {
    return fallback
  }
}

/** Pretty-print `value` to `file`, logging (never throwing) on failure. */
export function writeJsonFile(file: string, value: unknown, label: string): void {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8')
  } catch (err) {
    console.error(`[${label}] failed to persist:`, err)
  }
}
