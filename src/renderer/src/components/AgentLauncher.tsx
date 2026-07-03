import { useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import { MAX_GRID, distribute } from '../gridLayout'
import type { LayoutPreset, TerminalPreset } from '../types'

export interface LaunchConfig {
  presetIds: string[]
}

interface Props {
  presets: TerminalPreset[]
  /** the workspace's working directory, shown read-only above the picker */
  workingDir: string | null
  /** saved launch layouts shown in the Preset tab */
  layoutPresets: LayoutPreset[]
  onSaveLayoutPreset: (layout: LayoutPreset) => Promise<void>
  onDeleteLayoutPreset: (id: string) => Promise<void>
  onStart: (config: LaunchConfig) => void
}

/** Terminal counts offered in the launcher (capped at 8, even if the grid allows more). */
const COUNTS = Array.from({ length: Math.min(MAX_GRID, 8) }, (_, i) => i + 1)

/** Tiny tile diagram mirroring the real grid arrangement for a terminal count. */
function CountDiagram({ n }: { n: number }): JSX.Element {
  return (
    <div className="flex h-7 w-9 flex-col gap-0.5">
      {distribute(n).map((cols, r) => (
        <div key={r} className="flex flex-1 gap-0.5">
          {Array.from({ length: cols }).map((_, c) => (
            <span key={c} className="flex-1 rounded-sm bg-current" />
          ))}
        </div>
      ))}
    </div>
  )
}

type Tab = 'preset' | 'custom'

/**
 * Empty-tab launcher. Two ways to start terminals:
 *  - "Preset": pick a saved layout (grid + a terminal per slot) and START, or "+ New" to build one and save it.
 *  - "Custom": build a one-off layout from scratch and START without saving.
 */
export function AgentLauncher({
  presets,
  workingDir,
  layoutPresets,
  onSaveLayoutPreset,
  onDeleteLayoutPreset,
  onStart
}: Props): JSX.Element {
  const { t } = useI18n()
  const active = presets.filter((p) => p.active)
  const [tab, setTab] = useState<Tab>('preset')
  // In the Preset tab, whether the inline builder ("+ New") is open.
  const [creating, setCreating] = useState(false)
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null)
  const [name, setName] = useState('')

  const [count, setCount] = useState(1)
  const [slots, setSlots] = useState<string[]>(() => {
    const first = active[0]?.id ?? ''
    return first ? [first] : []
  })

  const defaultSlot = (i: number): string => (active[i] ?? active[0])?.id ?? ''

  // Reset the builder to a fresh single-terminal layout.
  const resetBuilder = (): void => {
    setCount(1)
    setSlots(active[0]?.id ? [active[0].id] : [])
    setName('')
  }

  // Resize the slot list, keeping existing choices for slots that survive.
  const chooseCount = (n: number): void => {
    setCount(n)
    setSlots((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? defaultSlot(i)))
  }

  const setSlot = (i: number, id: string): void =>
    setSlots((prev) => prev.map((v, idx) => (idx === i ? id : v)))

  const chooseTab = (next: Tab): void => {
    setTab(next)
    setCreating(false)
    if (next === 'custom') resetBuilder()
  }

  const openCreate = (): void => {
    resetBuilder()
    setCreating(true)
  }

  const startCustom = (): void => onStart({ presetIds: slots.filter(Boolean) })

  // Save the built layout as a preset, then launch it.
  const saveAndStart = async (): Promise<void> => {
    const presetIds = slots.filter(Boolean)
    if (presetIds.length === 0) return
    await onSaveLayoutPreset({
      id: crypto.randomUUID(),
      name: name.trim() || t('launcher.untitledPreset'),
      presetIds,
      createdAt: Date.now()
    })
    setCreating(false)
    onStart({ presetIds })
  }

  const startSelectedLayout = (): void => {
    const layout = layoutPresets.find((l) => l.id === selectedLayoutId)
    if (layout) onStart({ presetIds: layout.presetIds.filter(Boolean) })
  }

  if (active.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fgmuted">
        {t('launcher.noPresets')}
      </div>
    )
  }

  // Shared builder: grid-count picker + a terminal preset per slot.
  const builder = (
    <>
      <div className="mb-5">
        <div className="mb-2 text-xs text-fgmuted">{t('launcher.howMany')}</div>
        <div className="grid grid-cols-4 gap-2">
          {COUNTS.map((n) => (
            <button
              key={n}
              onClick={() => chooseCount(n)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition ${
                count === n
                  ? 'border-fgdim bg-hover text-fg'
                  : 'border-edge text-fgdim hover:bg-hover hover:text-fg'
              }`}
            >
              <CountDiagram n={n} />
              <span className="text-xs">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        {slots.map((id, i) => (
          <label key={i} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-fgmuted">
              {t('launcher.terminalN', { n: i + 1 })}
            </span>
            <span className="shrink-0">
              {(() => {
                const p = active.find((x) => x.id === id)
                return <PresetIcon iconType={p?.iconType} icon={p?.icon} className="h-4 w-4 text-base" />
              })()}
            </span>
            <select
              value={id}
              onChange={(e) => setSlot(i, e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-edge bg-panel px-2 py-1 text-xs text-fg focus:border-fgdim focus:outline-none"
            >
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </>
  )

  const showingBuilder = tab === 'custom' || creating

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-xl bg-bar/40 p-6">
        {workingDir && (
          <div className="mb-5">
            <div className="mb-2 text-xs text-fgmuted">{t('launcher.workingFolder')}</div>
            <div
              className="truncate rounded-md border border-edge bg-panel px-2 py-1.5 text-xs text-fgdim"
              title={workingDir}
            >
              {workingDir}
            </div>
          </div>
        )}

        {/* Mode switch: saved preset vs. one-off custom layout. */}
        <div className="mb-5 flex gap-1 rounded-lg border border-edge p-0.5">
          {(['preset', 'custom'] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => chooseTab(k)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs transition ${
                tab === k ? 'bg-hover text-fg' : 'text-fgdim hover:text-fg'
              }`}
            >
              {k === 'preset' ? t('launcher.tabPreset') : t('launcher.tabCustom')}
            </button>
          ))}
        </div>

        {tab === 'preset' && !creating && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-fgmuted">{t('launcher.savedPresets')}</span>
              <button
                onClick={openCreate}
                className="rounded-md border border-edge px-2 py-1 text-xs text-fgdim transition hover:bg-hover hover:text-fg"
              >
                {t('launcher.newPreset')}
              </button>
            </div>
            {layoutPresets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-edge px-3 py-6 text-center text-xs text-fgmuted">
                {t('launcher.noLayouts')}
              </div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {layoutPresets.map((layout) => (
                  <div
                    key={layout.id}
                    onClick={() => setSelectedLayoutId(layout.id)}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                      selectedLayoutId === layout.id
                        ? 'border-fgdim bg-hover'
                        : 'border-edge hover:bg-hover'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">{layout.name}</div>
                      <div className="mt-1 flex items-center gap-1">
                        {layout.presetIds.map((id, i) => {
                          const p = active.find((x) => x.id === id)
                          return (
                            <PresetIcon
                              key={i}
                              iconType={p?.iconType}
                              icon={p?.icon}
                              className="h-3.5 w-3.5 text-sm"
                            />
                          )
                        })}
                        <span className="ml-1 text-xs text-fgmuted">
                          {t('launcher.terminalCount', { n: layout.presetIds.length })}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (selectedLayoutId === layout.id) setSelectedLayoutId(null)
                        void onDeleteLayoutPreset(layout.id)
                      }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-fgmuted transition hover:bg-panel hover:text-fg"
                      aria-label={t('launcher.deletePreset')}
                      title={t('launcher.deletePreset')}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={startSelectedLayout}
              disabled={!selectedLayoutId}
              className="mt-5 w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('launcher.start')}
            </button>
          </>
        )}

        {showingBuilder && (
          <>
            {builder}

            {creating && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('launcher.presetNamePlaceholder')}
                className="mt-4 w-full rounded-md border border-edge bg-panel px-2 py-1.5 text-xs text-fg placeholder:text-fgmuted focus:border-fgdim focus:outline-none"
              />
            )}

            <div className="mt-5 flex gap-2">
              {creating && (
                <button
                  onClick={() => setCreating(false)}
                  className="rounded-md border border-edge px-4 py-2 text-sm text-fgdim transition hover:bg-hover hover:text-fg"
                >
                  {t('launcher.cancel')}
                </button>
              )}
              <button
                onClick={creating ? () => void saveAndStart() : startCustom}
                disabled={slots.filter(Boolean).length === 0}
                className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {creating ? t('launcher.saveAndStart') : t('launcher.start')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
