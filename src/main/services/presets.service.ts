import { dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { PresetsState, TerminalPreset } from '@shared/types'
import { builtinIcon } from '@shared/icons'
import { readJsonFile, userDataFile, writeJsonFile } from '../lib/jsonStore'

function storeFile(): string {
  return userDataFile('presets.json')
}

/** Built-in presets seeded on first run, preserving the original Claude/Codex launchers. */
function defaultPresets(): TerminalPreset[] {
  return [
    {
      id: randomUUID(),
      name: 'Claude',
      description: 'Anthropic Claude CLI',
      command: 'claude --dangerously-skip-permissions',
      iconType: 'image',
      icon: builtinIcon('claude')!.dataUrl,
      active: true
    },
    {
      id: randomUUID(),
      name: 'Codex',
      description: 'Codex CLI',
      command: 'codex --dangerously-bypass-approvals-and-sandbox',
      iconType: 'image',
      icon: builtinIcon('codex')!.dataUrl,
      active: true
    }
  ]
}

function save(state: PresetsState): void {
  writeJsonFile(storeFile(), state, 'presets')
}

function read(): PresetsState {
  const parsed = readJsonFile<PresetsState | null>(storeFile(), null, (p) => {
    const obj = p as Partial<PresetsState>
    return obj && Array.isArray(obj.presets) ? { presets: obj.presets } : null
  })
  if (parsed) return parsed
  const seeded: PresetsState = { presets: defaultPresets() }
  save(seeded)
  return seeded
}

export function listPresets(): PresetsState {
  return read()
}

/** Upsert a preset by id (adds when new, replaces when existing). */
export function savePreset(preset: TerminalPreset): PresetsState {
  const state = read()
  const idx = state.presets.findIndex((p) => p.id === preset.id)
  if (idx >= 0) state.presets[idx] = preset
  else state.presets.push(preset)
  save(state)
  return state
}

export function deletePreset(id: string): PresetsState {
  const state = read()
  state.presets = state.presets.filter((p) => p.id !== id)
  save(state)
  return state
}

/** Reorder presets to match the given id order; unknown ids are ignored. */
export function reorderPresets(orderedIds: string[]): PresetsState {
  const state = read()
  const byId = new Map(state.presets.map((p) => [p.id, p]))
  const reordered = orderedIds.map((id) => byId.get(id)).filter((p): p is TerminalPreset => !!p)
  // keep any presets not present in orderedIds (defensive) at the end
  for (const p of state.presets) if (!orderedIds.includes(p.id)) reordered.push(p)
  state.presets = reordered
  save(state)
  return state
}

export function setPresetActive(id: string, active: boolean): PresetsState {
  const state = read()
  const preset = state.presets.find((p) => p.id === id)
  if (preset) preset.active = active
  save(state)
  return state
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
}

/** Pick an image file and return it as a data URL (CSP-friendly for the renderer). */
export async function pickPresetImage(): Promise<{ dataUrl: string } | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose icon image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: IMAGE_EXTS }]
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const file = result.filePaths[0]
  const ext = path.extname(file).slice(1).toLowerCase()
  const mime = MIME[ext] ?? 'application/octet-stream'
  const base64 = (await fs.promises.readFile(file)).toString('base64')
  return { dataUrl: `data:${mime};base64,${base64}` }
}
