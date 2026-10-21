import { useEffect, useRef, useState } from 'react'
import { PresetIcon } from './PresetIcon'
import { builtinIcon } from '@shared/icons'
import { useI18n } from '../i18n'
import { ipcErrorMessage as errorText } from '../ipcError'
import {
  Button,
  ChoiceCards,
  Field,
  Input,
  Modal,
  Notice,
  PlusIcon,
  SectionHeader
} from './ui'
import type {
  CustomMemoryPreset,
  CustomMemoryProvider,
  PresetsState
} from '../types'

interface Props {
  onPresetsChanged: (state: PresetsState) => void
}

const PROVIDER_UI = {
  claude: { label: 'Claude', directoryPrefix: '.claude-', iconId: 'claude' },
  codex: { label: 'Codex', directoryPrefix: '.codex-', iconId: 'codex' }
} as const

export function CustomMemoryPresets({ onPresetsChanged }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [items, setItems] = useState<CustomMemoryPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [provider, setProvider] = useState<CustomMemoryProvider>('claude')
  const [name, setName] = useState('')
  // Create failures render inside the modal — the section-level error sits behind it.
  const [createError, setCreateError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

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
    // busyId guard: Enter in the name input can fire again before the button
    // disables, which would create the preset twice.
    if (!name.trim() || busyId === 'create') return
    setBusyId('create')
    setCreateError(null)
    try {
      const result = await window.api.createCustomMemoryPreset(provider, name)
      setItems(result.memories)
      onPresetsChanged(result.presets)
      setCreating(false)
      setName('')
    } catch (err) {
      setCreateError(errorText(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="settings-subsection">
      <SectionHeader level={3} title={t('memory.title')} description={t('memory.description')}
        actions={<Button variant="secondary" onClick={() => { setError(null); setCreateError(null); setCreating(true) }}><PlusIcon />{t('memory.add')}</Button>}
      />

      {error && <Notice className="mb-3">{error}</Notice>}

      <div className="settings-island">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-fgmuted">{t('memory.loading')}</div>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-fgmuted">{t('memory.empty')}</div>
        ) : (
          <div className="divide-y divide-edge">
            {items.map((item) => (
              <div
                key={item.id}
                className="settings-memory-row flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-bar/60"
              >
                <PresetIcon
                  iconType="image"
                  icon={builtinIcon(PROVIDER_UI[item.provider].iconId)?.dataUrl}
                  className="h-8 w-8 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-medium text-fg">{item.aliasName}</span>
                    <span className="rounded-full bg-bar px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-fgmuted">
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
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => void addAlias(item)}
                    >
                      {t('memory.addAlias')}
                    </Button>
                  )}

                  {item.terminalPresetExists ? (
                    <span className="text-xs text-fgmuted">{t('memory.inTerminalPresets')}</span>
                  ) : (
                    <Button variant="secondary" size="sm" disabled={busyId === item.id} onClick={() => void addTerminalPreset(item)}>
                      {t('memory.addToTerminalPresets')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <Modal
          title={t('memory.createTitle')}
          onClose={() => busyId !== 'create' && setCreating(false)}
          dismissable={busyId !== 'create'}
          initialFocusRef={nameRef}
          closeLabel={t('common.cancel')}
          footer={
            <>
              <Button
                variant="ghost"
                disabled={busyId === 'create'}
                onClick={() => setCreating(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                form="memory-create-form"
                disabled={!name.trim()}
                loading={busyId === 'create'}
              >
                {busyId === 'create' ? t('memory.creating') : t('memory.create')}
              </Button>
            </>
          }
        >
          <form
            id="memory-create-form"
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <Field label={t('memory.provider')}>
              <ChoiceCards
                aria-label={t('memory.provider')}
                value={provider}
                onChange={setProvider}
                options={(Object.keys(PROVIDER_UI) as CustomMemoryProvider[]).map((value) => ({
                  value,
                  label: PROVIDER_UI[value].label,
                  description: `~/${PROVIDER_UI[value].directoryPrefix}name`,
                  icon: (
                    <PresetIcon
                      iconType="image"
                      icon={builtinIcon(PROVIDER_UI[value].iconId)?.dataUrl}
                      className="h-5 w-5"
                    />
                  )
                }))}
              />
            </Field>
            <Field
              label={t('memory.name')}
              htmlFor="memory-name"
              hint={t('memory.nameHint', {
                directory: `${PROVIDER_UI[provider].directoryPrefix}${name.trim() || 'name'}`,
                alias: `${provider}-${name.trim() || 'name'}`
              })}
            >
              <Input
                id="memory-name"
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="work"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            {createError && <Notice>{createError}</Notice>}
          </form>
        </Modal>
      )}
    </section>
  )
}
