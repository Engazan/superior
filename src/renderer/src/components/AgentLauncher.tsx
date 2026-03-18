import { useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { useI18n } from '../i18n'
import { MAX_GRID, distribute } from '../gridLayout'
import type { TerminalPreset } from '../types'

export interface LaunchConfig {
  mode: 'tabs' | 'grid'
  presetIds: string[]
}

interface Props {
  presets: TerminalPreset[]
  onStart: (config: LaunchConfig) => void
}

const COUNTS = Array.from({ length: MAX_GRID }, (_, i) => i + 1)

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

/** Empty-state wizard: choose GRID/TABS, terminal count, a preset per slot, then START. */
export function AgentLauncher({ presets, onStart }: Props): JSX.Element {
  const { t } = useI18n()
  const active = presets.filter((p) => p.active)
  const [mode, setMode] = useState<'tabs' | 'grid' | null>(null)
  const [count, setCount] = useState(1)
  const [slots, setSlots] = useState<string[]>([])

  const defaultSlot = (i: number): string => (active[i] ?? active[0])?.id ?? ''

  // Resize the slot list, keeping existing choices for slots that survive.
  const resizeSlots = (n: number): void =>
    setSlots((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? defaultSlot(i)))

  const chooseMode = (m: 'tabs' | 'grid'): void => {
    setMode(m)
    if (m === 'tabs') {
      setSlots([defaultSlot(0)])
    } else {
      setCount(1)
      resizeSlots(1)
    }
  }

  const chooseCount = (n: number): void => {
    setCount(n)
    resizeSlots(n)
  }

  const setSlot = (i: number, id: string): void =>
    setSlots((prev) => prev.map((v, idx) => (idx === i ? id : v)))

  const reset = (): void => {
    setMode(null)
    setSlots([])
  }

  if (active.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fgmuted">
        {t('launcher.noPresets')}
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-xl border border-edge bg-bar/40 p-6">
        {mode === null ? (
          <>
            <h2 className="mb-4 text-sm font-medium text-fg">{t('launcher.workType')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => chooseMode('grid')}
                className="flex flex-col items-center gap-2 rounded-lg border border-edge px-4 py-5 text-fgdim transition hover:border-fgdim hover:bg-hover hover:text-fg"
              >
                <CountDiagram n={6} />
                <span className="text-sm font-medium">{t('launcher.grid')}</span>
                <span className="text-center text-xs text-fgmuted">{t('launcher.gridDesc')}</span>
              </button>
              <button
                onClick={() => chooseMode('tabs')}
                className="flex flex-col items-center gap-2 rounded-lg border border-edge px-4 py-5 text-fgdim transition hover:border-fgdim hover:bg-hover hover:text-fg"
              >
                <div className="flex h-7 w-9 items-end gap-0.5">
                  <span className="h-4 flex-1 rounded-t-sm bg-current" />
                  <span className="h-5 flex-1 rounded-t-sm bg-current" />
                  <span className="h-4 flex-1 rounded-t-sm bg-current" />
                </div>
                <span className="text-sm font-medium">{t('launcher.tabs')}</span>
                <span className="text-center text-xs text-fgmuted">{t('launcher.tabsDesc')}</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-fg">
                {mode === 'grid' ? t('launcher.grid') : t('launcher.tabs')}
              </h2>
              <button
                onClick={reset}
                className="text-xs text-fgdim transition hover:text-fg"
              >
                ← {t('launcher.back')}
              </button>
            </div>

            {mode === 'grid' && (
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
            )}

            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
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

            <button
              onClick={() => onStart({ mode, presetIds: slots.filter(Boolean) })}
              className="mt-5 w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
            >
              {t('launcher.start')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
