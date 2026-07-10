import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ getPath: vi.fn() }))

vi.mock('electron', () => ({ app: { getPath: electron.getPath } }))

import { createJsonListStore, readJsonFile, userDataFile, writeJsonFile } from './jsonStore'

describe('jsonStore', () => {
  let userData: string

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-json-store-'))
    electron.getPath.mockReturnValue(userData)
  })

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true })
    electron.getPath.mockReset()
  })

  it('returns the fallback for a missing or validator-rejected file', () => {
    const file = path.join(userData, 'missing.json')
    expect(readJsonFile(file, { items: [] })).toEqual({ items: [] })

    fs.writeFileSync(file, JSON.stringify({ items: 'not-an-array' }))
    expect(readJsonFile(file, [], (value) => (Array.isArray(value) ? value : null))).toEqual([])
  })

  it('preserves malformed JSON as .corrupt rather than overwriting it later', () => {
    const file = path.join(userData, 'settings.json')
    fs.writeFileSync(file, '{broken')

    expect(readJsonFile(file, { theme: 'dark' })).toEqual({ theme: 'dark' })
    expect(fs.readFileSync(`${file}.corrupt`, 'utf8')).toBe('{broken')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('writes atomically and supports list-store upsert and remove', () => {
    const file = path.join(userData, 'state.json')
    writeJsonFile(file, { ready: true }, 'test')
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ ready: true })
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)

    const store = createJsonListStore<{ id: string; value: number }>('items.json', 'items', 'test')
    expect(userDataFile('items.json')).toBe(path.join(userData, 'items.json'))
    expect(store.upsert({ id: 'a', value: 1 })).toEqual([{ id: 'a', value: 1 }])
    expect(store.upsert({ id: 'a', value: 2 })).toEqual([{ id: 'a', value: 2 }])
    expect(store.upsert({ id: 'b', value: 3 })).toHaveLength(2)
    expect(store.remove('a')).toEqual([{ id: 'b', value: 3 }])
  })
})
