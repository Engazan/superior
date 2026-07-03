import { useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import { Button, CloseIcon, EmptyState, IconButton, Input, SegmentedControl, useToast } from './ui'
import { MAX_GRID, distribute } from '../gridLayout'
import type { LayoutPreset, TerminalPreset } from '../types'

export interface LaunchConfig {
  presetIds: string[]
  /** per-slot nicknames aligned with presetIds by index; blank = use preset default */
  nicknames?: string[]
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
  const toast = useToast()
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
  // Per-slot nicknames, aligned with `slots` by index. Blank means "use the
  // preset's own nickname" (resolved at launch time).
  const [nicks, setNicks] = useState<string[]>(() => (active[0]?.id ? [''] : []))

  const defaultSlot = (i: number): string => (active[i] ?? active[0])?.id ?? ''

  // Reset the builder to a fresh single-terminal layout.
  const resetBuilder = (): void => {
    setCount(1)
    setSlots(active[0]?.id ? [active[0].id] : [])
    setNicks(active[0]?.id ? [''] : [])
    setName('')
  }

  // Resize the slot + nickname lists, keeping existing choices for slots that survive.
  const chooseCount = (n: number): void => {
    setCount(n)
    setSlots((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? defaultSlot(i)))
    setNicks((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ''))
  }

  const setSlot = (i: number, id: string): void =>
    setSlots((prev) => prev.map((v, idx) => (idx === i ? id : v)))

  const setNick = (i: number, v: string): void =>
    setNicks((prev) => prev.map((x, idx) => (idx === i ? v : x)))

  // Collapse the builder state into a launch config, dropping empty slots and
  // keeping each surviving slot's nickname aligned by index.
  const buildConfig = (): LaunchConfig => {
    const presetIds: string[] = []
    const nicknames: string[] = []
    slots.forEach((id, i) => {
      if (!id) return
      presetIds.push(id)
      nicknames.push((nicks[i] ?? '').trim())
    })
    return { presetIds, nicknames }
  }

  const chooseTab = (next: Tab): void => {
    setTab(next)
    setCreating(false)
    if (next === 'custom') resetBuilder()
  }

  const openCreate = (): void => {
    resetBuilder()
    setCreating(true)
  }

  const startCustom = (): void => onStart(buildConfig())

  // Save the built layout as a preset, then launch it.
  const saveAndStart = async (): Promise<void> => {
    const { presetIds, nicknames } = buildConfig()
    if (presetIds.length === 0) return
    const layoutName = name.trim() || t('launcher.untitledPreset')
    await onSaveLayoutPreset({
      id: crypto.randomUUID(),
      name: layoutName,
      presetIds,
      // Only persist nicknames when at least one slot has a custom one.
      nicknames: nicknames?.some(Boolean) ? nicknames : undefined,
      createdAt: Date.now()
    })
    setCreating(false)
    toast.success(t('toast.layoutSaved', { name: layoutName }))
    onStart({ presetIds, nicknames })
  }

  const startSelectedLayout = (): void => {
    const layout = layoutPresets.find((l) => l.id === selectedLayoutId)
    if (layout) onStart({ presetIds: layout.presetIds.filter(Boolean), nicknames: layout.nicknames })
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
        {slots.map((id, i) => {
          const p = active.find((x) => x.id === id)
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-fgmuted">
                {t('launcher.terminalN', { n: i + 1 })}
              </span>
              <span className="shrink-0">
                <PresetIcon iconType={p?.iconType} icon={p?.icon} className="h-4 w-4 text-base" />
              </span>
              <select
                value={id}
                onChange={(e) => setSlot(i, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-edge bg-panel px-2 py-1 text-xs text-fg focus:border-fgdim focus:outline-none"
              >
                {active.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
              {/* Optional per-slot nickname; placeholder hints the preset's own default. */}
              <input
                value={nicks[i] ?? ''}
                onChange={(e) => setNick(i, e.target.value)}
                placeholder={p?.nickname || t('launcher.nicknamePlaceholder')}
                className="w-24 shrink-0 rounded-md border border-edge bg-panel px-2 py-1 text-xs text-fg placeholder:text-fgmuted focus:border-fgdim focus:outline-none"
              />
            </div>
          )
        })}
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
        <div className="mb-5">
          <SegmentedControl
            aria-label={t('launcher.tabPreset')}
            size="sm"
            fill
            options={[
              { value: 'preset', label: t('launcher.tabPreset') },
              { value: 'custom', label: t('launcher.tabCustom') }
            ]}
            value={tab}
            onChange={(k) => chooseTab(k as Tab)}
          />
        </div>

        {tab === 'preset' && !creating && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-fgmuted">{t('launcher.savedPresets')}</span>
              <Button variant="secondary" size="sm" onClick={openCreate}>
                {t('launcher.newPreset')}
              </Button>
            </div>
            {layoutPresets.length === 0 ? (
              <EmptyState title={t('launcher.noLayouts')} />
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
                    <IconButton
                      size="sm"
                      label={t('launcher.deletePreset')}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (selectedLayoutId === layout.id) setSelectedLayoutId(null)
                        void onDeleteLayoutPreset(layout.id)
                      }}
                    >
                      <CloseIcon size={12} />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
            <Button className="mt-5 w-full" disabled={!selectedLayoutId} onClick={startSelectedLayout}>
              {t('launcher.start')}
            </Button>
          </>
        )}

        {showingBuilder && (
          <>
            {builder}

            {creating && (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('launcher.presetNamePlaceholder')}
                className="mt-4"
              />
            )}

            <div className="mt-5 flex gap-2">
              {creating && (
                <Button variant="secondary" onClick={() => setCreating(false)}>
                  {t('launcher.cancel')}
                </Button>
              )}
              <Button
                className="flex-1"
                disabled={slots.filter(Boolean).length === 0}
                onClick={creating ? () => void saveAndStart() : startCustom}
              >
                {creating ? t('launcher.saveAndStart') : t('launcher.start')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
