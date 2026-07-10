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
 * A persisted list of id-keyed items stored as `{ [key]: T[] }` in a userData
 * JSON file. Consolidates the read/save/upsert/delete-by-id pattern the list
 * stores (prompts, layout presets) used to copy-paste. Stores with extra
 * top-level fields or custom read-time normalization keep their own code.
 */
export function createJsonListStore<T extends { id: string }>(
  file: string,
  key: string,
  label: string
): {
  read(): T[]
  save(items: T[]): void
  upsert(item: T): T[]
  remove(id: string): T[]
} {
  const target = (): string => userDataFile(file)
  const read = (): T[] =>
    readJsonFile<T[] | null>(target(), null, (p) => {
      const obj = p as Record<string, unknown>
      return obj && Array.isArray(obj[key]) ? (obj[key] as T[]) : null
    }) ?? []
  const save = (items: T[]): void => writeJsonFile(target(), { [key]: items }, label)
  return {
    read,
    save,
    upsert(item: T): T[] {
      const items = read()
      const idx = items.findIndex((x) => x.id === item.id)
      if (idx >= 0) items[idx] = item
      else items.push(item)
      save(items)
      return items
    },
    remove(id: string): T[] {
      const items = read().filter((x) => x.id !== id)
      save(items)
      return items
    }
  }
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
