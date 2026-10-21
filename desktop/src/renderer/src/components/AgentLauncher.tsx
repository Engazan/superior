import { useEffect, useId, useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import {
  Button,
  CloseIcon,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  Toggle,
  useConfirm,
  useToast
} from './ui'
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
  /** the layout auto-launched when this workspace opens empty, if any */
  startupLayoutId?: string
  /** set (or clear, with null) the workspace's startup layout */
  onSetStartupLayout: (layoutId: string | null) => void
  onSaveLayoutPreset: (layout: LayoutPreset) => Promise<void>
  onDeleteLayoutPreset: (id: string) => Promise<void>
  onStart: (config: LaunchConfig) => void
  /** jump to Settings → Terminal presets (empty-state CTA) */
  onManagePresets: () => void
}

/** Terminal counts offered in the launcher (capped at 8, even if the grid allows more). */
const COUNTS = Array.from({ length: Math.min(MAX_GRID, 8) }, (_, i) => i + 1)

/** Section label shared by the launcher's groups (Field's label role). */
const LABEL = 'mb-1.5 block text-xs font-medium text-fg2'

/** Tiny tile diagram mirroring the real grid arrangement for a terminal count. */
function CountDiagram({ n }: { n: number }): React.JSX.Element {
  return (
    <div className="flex h-7 w-9 flex-col gap-0.5" aria-hidden>
      {distribute(n).map((cols, r) => (
        <div key={r} className="flex flex-1 gap-0.5">
          {Array.from({ length: cols }).map((_, c) => (
            <span key={c} className="flex-1 rounded-xs bg-current" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Label + switch row for the "launch on open" option. */
function LaunchOnOpen({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <span className="text-xs text-fgdim">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
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
  startupLayoutId,
  onSetStartupLayout,
  onSaveLayoutPreset,
  onDeleteLayoutPreset,
  onStart,
  onManagePresets
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const ids = useId()
  const active = presets.filter((p) => p.active)
  const [tab, setTab] = useState<Tab>('preset')
  // In the Preset tab, whether the inline builder ("+ New") is open.
  const [creating, setCreating] = useState(false)
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null)
  const [name, setName] = useState('')
  // "+ New" builder: also mark the saved layout as this workspace's startup layout.
  const [launchOnOpen, setLaunchOnOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [count, setCount] = useState(1)
  const [slots, setSlots] = useState<string[]>(() => {
    const first = active[0]?.id ?? ''
    return first ? [first] : []
  })
  // Per-slot nicknames, aligned with `slots` by index. Blank means "use the
  // preset's own nickname" (resolved at launch time).
  const [nicks, setNicks] = useState<string[]>(() => (active[0]?.id ? [''] : []))

  // Presets may load after mount; without this the builder renders an empty
  // slot list (and a dead Start) until the user re-clicks a count.
  useEffect(() => {
    if (slots.length === 0 && active[0]?.id) {
      setSlots([active[0].id])
      setNicks([''])
      setCount(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length])

  const defaultSlot = (i: number): string => (active[i] ?? active[0])?.id ?? ''

  // Reset the builder to a fresh single-terminal layout.
  const resetBuilder = (): void => {
    setCount(1)
    setSlots(active[0]?.id ? [active[0].id] : [])
    setNicks(active[0]?.id ? [''] : [])
    setName('')
    setLaunchOnOpen(false)
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
    if (presetIds.length === 0 || saving) return
    const layoutName = name.trim() || t('launcher.untitledPreset')
    const id = crypto.randomUUID()
    setSaving(true)
    try {
      await onSaveLayoutPreset({
        id,
        name: layoutName,
        presetIds,
        // Only persist nicknames when at least one slot has a custom one.
        nicknames: nicknames?.some(Boolean) ? nicknames : undefined,
        createdAt: Date.now()
      })
    } finally {
      setSaving(false)
    }
    if (launchOnOpen) onSetStartupLayout(id)
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
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md">
          <EmptyState
            title={t('launcher.noPresets')}
            action={<Button onClick={onManagePresets}>{t('terminal.managePresets')}</Button>}
          />
        </div>
      </div>
    )
  }

  const countLabelId = `${ids}-count`
  const canStart = slots.some(Boolean)

  // Shared builder: grid-count picker + a terminal preset per slot.
  const builder = (
    <>
      <div className="mb-5">
        <div id={countLabelId} className={LABEL}>
          {t('launcher.howMany')}
        </div>
        <div role="group" aria-labelledby={countLabelId} className="grid grid-cols-4 gap-2">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={count === n}
              onClick={() => chooseCount(n)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50 ${
                count === n
                  ? 'border-accent bg-accentBg/70 text-fg'
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
          const slotLabel = t('launcher.terminalN', { n: i + 1 })
          return (
            <div key={i} className="flex items-center gap-2">
              <label htmlFor={`${ids}-slot-${i}`} className="w-16 shrink-0 text-xs text-fgmuted">
                {slotLabel}
              </label>
              <span className="shrink-0">
                <PresetIcon iconType={p?.iconType} icon={p?.icon} className="h-4 w-4 text-base" />
              </span>
              <Select
                id={`${ids}-slot-${i}`}
                value={id}
                onChange={(e) => setSlot(i, e.target.value)}
                className="min-w-0 flex-1"
              >
                {active.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </Select>
              {/* Optional per-slot nickname; placeholder hints the preset's own default. */}
              <Input
                value={nicks[i] ?? ''}
                onChange={(e) => setNick(i, e.target.value)}
                placeholder={p?.nickname || t('launcher.nicknamePlaceholder')}
                aria-label={`${slotLabel}: ${t('launcher.nicknamePlaceholder')}`}
                autoComplete="off"
                className="w-24! shrink-0"
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
            <div className={LABEL}>{t('launcher.workingFolder')}</div>
            <div
              className="truncate rounded-md border border-edge bg-panel px-3 py-1.5 font-mono text-xs text-fgdim"
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
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-fg2">{t('launcher.savedPresets')}</span>
              <Button variant="secondary" size="sm" onClick={openCreate}>
                {t('launcher.newPreset')}
              </Button>
            </div>
            {layoutPresets.length === 0 ? (
              <EmptyState title={t('launcher.noLayouts')} />
            ) : (
              <div
                role="group"
                aria-label={t('launcher.savedPresets')}
                className="max-h-64 space-y-2 overflow-y-auto pr-1"
              >
                {layoutPresets.map((layout) => {
                  const selected = selectedLayoutId === layout.id
                  return (
                    <div
                      key={layout.id}
                      className={`flex items-center gap-2 rounded-lg border pr-2 transition ${
                        selected ? 'border-accent bg-accentBg/70' : 'border-edge hover:bg-hover'
                      }`}
                    >
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedLayoutId(layout.id)}
                        // Double-click = select + launch in one gesture.
                        onDoubleClick={() =>
                          onStart({
                            presetIds: layout.presetIds.filter(Boolean),
                            nicknames: layout.nicknames
                          })
                        }
                        className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/50"
                      >
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
                      </button>
                      <IconButton
                        size="sm"
                        label={`${t('launcher.deletePreset')}: ${layout.name}`}
                        onClick={() => {
                          void (async () => {
                            // A hover X one pixel from the row is too easy to hit
                            // for an unrecoverable delete — confirm first.
                            const ok = await confirm({
                              title: t('launcher.deletePreset'),
                              message: t('launcher.deletePresetConfirm', { name: layout.name }),
                              confirmLabel: t('common.delete'),
                              tone: 'danger'
                            })
                            if (!ok) return
                            if (selectedLayoutId === layout.id) setSelectedLayoutId(null)
                            void onDeleteLayoutPreset(layout.id)
                          })()
                        }}
                      >
                        <CloseIcon size={12} />
                      </IconButton>
                    </div>
                  )
                })}
              </div>
            )}
            {/* Auto-launch the selected layout whenever this workspace opens empty. */}
            {selectedLayoutId && (
              <LaunchOnOpen
                label={t('launcher.launchOnOpen')}
                checked={startupLayoutId === selectedLayoutId}
                onChange={(checked) => onSetStartupLayout(checked ? selectedLayoutId : null)}
              />
            )}
            <Button className="mt-4 w-full" disabled={!selectedLayoutId} onClick={startSelectedLayout}>
              {t('launcher.start')}
            </Button>
          </>
        )}

        {showingBuilder && (
          // A form so Enter in the name/nickname fields starts (or saves) the layout.
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!canStart) return
              if (creating) void saveAndStart()
              else startCustom()
            }}
          >
            {builder}

            {creating && (
              <>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('launcher.presetNamePlaceholder')}
                  aria-label={t('launcher.presetNamePlaceholder')}
                  autoComplete="off"
                  className="mt-4"
                />
                <LaunchOnOpen
                  label={t('launcher.launchOnOpen')}
                  checked={launchOnOpen}
                  onChange={setLaunchOnOpen}
                />
              </>
            )}

            <div className="mt-5 flex gap-2">
              {creating && (
                <Button type="button" variant="ghost" disabled={saving} onClick={() => setCreating(false)}>
                  {t('launcher.cancel')}
                </Button>
              )}
              <Button type="submit" className="flex-1" loading={saving} disabled={!canStart}>
                {creating ? t('launcher.saveAndStart') : t('launcher.start')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
