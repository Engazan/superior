import { useEffect, useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { builtinIcon } from '@shared/icons'
import { useI18n } from '../i18n'
import type {
  CustomMemoryPreset,
  CustomMemoryProvider,
  PresetsState
} from '../types'

interface Props {
  onPresetsChanged: (state: PresetsState) => void
}

const inputCls =
  'w-full rounded-md border border-edge bg-bar px-3 py-1.5 text-sm text-fg outline-none focus:border-accent'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const PROVIDER_UI = {
  claude: { label: 'Claude', directoryPrefix: '.claude-', iconId: 'claude' },
  codex: { label: 'Codex', directoryPrefix: '.codex-', iconId: 'codex' }
} as const

export function CustomMemoryPresets({ onPresetsChanged }: Props): JSX.Element {
  const { t } = useI18n()
  const [items, setItems] = useState<CustomMemoryPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [provider, setProvider] = useState<CustomMemoryProvider>('claude')
  const [name, setName] = useState('')

  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await window.api.listCustomMemoryPresets())
      setError(null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const addAlias = async (item: CustomMemoryPreset): Promise<void> => {
    setBusyId(item.id)
    setError(null)
    try {
      setItems(await window.api.addCustomMemoryAlias(item.directoryName))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  const addTerminalPreset = async (item: CustomMemoryPreset): Promise<void> => {
    setBusyId(item.id)
    setError(null)
    try {
      const result = await window.api.addCustomMemoryTerminalPreset(item.directoryName)
      setItems(result.memories)
      onPresetsChanged(result.presets)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  const create = async (): Promise<void> => {
    if (!name.trim()) return
    setBusyId('create')
    setError(null)
    try {
      const result = await window.api.createCustomMemoryPreset(provider, name)
      setItems(result.memories)
      onPresetsChanged(result.presets)
      setCreating(false)
      setName('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mt-10 border-t border-edge pt-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-fg">{t('memory.title')}</h3>
          <p className="mt-1 text-xs text-fgdim">{t('memory.description')}</p>
        </div>
        <button
          className="shrink-0 rounded-md border border-edge bg-bar px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-hover"
          onClick={() => {
            setError(null)
            setCreating(true)
          }}
        >
          {t('memory.add')}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-edge">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-fgmuted">{t('memory.loading')}</div>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-fgmuted">{t('memory.empty')}</div>
        ) : (
          <div className="divide-y divide-edge">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-3 py-3 transition hover:bg-bar/60"
              >
                <PresetIcon
                  iconType="image"
                  icon={builtinIcon(PROVIDER_UI[item.provider].iconId)?.dataUrl}
                  className="h-8 w-8 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg">{item.aliasName}</span>
                    <span className="rounded bg-bar px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fgmuted">
                      {PROVIDER_UI[item.provider].label}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-fgdim">
                    ~/{item.directoryName}
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-fgmuted">
                    {item.aliasCommand}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {item.aliasExists ? (
                    <span className="text-xs font-medium text-status">
                      {t('memory.aliasExists', {
                        files: item.aliasFiles.join(', ')
                      })}
                    </span>
                  ) : (
                    <button
                      disabled={busyId === item.id}
                      className="rounded-md border border-edge px-2.5 py-1 text-xs font-medium text-fgdim transition hover:bg-hover hover:text-fg disabled:opacity-50"
                      onClick={() => void addAlias(item)}
                    >
                      {t('memory.addAlias')}
                    </button>
                  )}

                  {item.terminalPresetExists ? (
                    <span className="text-xs text-fgmuted">{t('memory.inTerminalPresets')}</span>
                  ) : (
                    <button
                      disabled={busyId === item.id}
                      className="rounded-md bg-accentBg px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accentBorder transition hover:brightness-95 disabled:opacity-50"
                      onClick={() => void addTerminalPreset(item)}
                    >
                      {t('memory.addToTerminalPresets')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setCreating(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-edge bg-panel p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="mb-4 text-base font-semibold text-fg">{t('memory.createTitle')}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fgdim">
                  {t('memory.provider')}
                </label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  {(Object.keys(PROVIDER_UI) as CustomMemoryProvider[]).map((value) => {
                    const item = PROVIDER_UI[value]
                    const selected = provider === value
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setProvider(value)}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          selected
                            ? 'border-accent bg-accentBg text-fg shadow-sm'
                            : 'border-edge bg-bar text-fgdim hover:border-fgmuted hover:bg-hover hover:text-fg'
                        }`}
                      >
                        <PresetIcon
                          iconType="image"
                          icon={builtinIcon(item.iconId)?.dataUrl}
                          className="h-9 w-9 shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{item.label}</span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-fgmuted">
                            ~/{item.directoryPrefix}name
                          </span>
                        </span>
                        <span
                          className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            selected ? 'border-accent bg-accent' : 'border-fgmuted'
                          }`}
                          aria-hidden
                        >
                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-panel" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fgdim">
                  {t('memory.name')}
                </label>
                <input
                  autoFocus
                  className={inputCls}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void create()
                  }}
                  placeholder="work"
                />
                <p className="mt-1.5 text-xs text-fgmuted">
                  {t('memory.nameHint', {
                    directory: `${PROVIDER_UI[provider].directoryPrefix}${name.trim() || 'name'}`,
                    alias: `${provider}-${name.trim() || 'name'}`
                  })}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-fgdim hover:text-fg"
                onClick={() => setCreating(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                disabled={!name.trim() || busyId === 'create'}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => void create()}
              >
                {busyId === 'create' ? t('memory.creating') : t('memory.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
