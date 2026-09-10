import { useEffect, useRef, useState } from 'react'
import { builtinIcon } from '@shared/icons'
import { customMemoryName } from '@shared/custom-memory'
import { useI18n } from '../i18n'
import { useTheme } from '../theme'
import { THEME_OPTIONS } from '../themeOptions'
import { ipcErrorMessage } from '../ipcError'
import type { CustomMemoryPreset, CustomMemoryProvider, Language, PresetsState, ThemeMode } from '../types'
import { Button, CheckIcon, ChevronIcon, FolderIcon, Input, Modal, PlusIcon, Toggle } from './ui'
import { PresetIcon } from './PresetIcon'

interface Props {
  replay?: boolean
  onPresetsChanged: (state: PresetsState) => void
  onClose: () => void
}

const LANGUAGES: { value: Language; name: string; greeting: string }[] = [
  { value: 'en', name: 'English', greeting: 'Hello, welcome in.' },
  { value: 'sk', name: 'Slovenčina', greeting: 'Ahoj, vitaj.' },
  { value: 'cs', name: 'Čeština', greeting: 'Ahoj, vítej.' },
  { value: 'pl', name: 'Polski', greeting: 'Cześć, witaj.' },
  { value: 'hu', name: 'Magyar', greeting: 'Szia, üdvözlünk.' }
]
const STEPS = ['onboarding.language', 'onboarding.theme', 'onboarding.accounts'] as const
const selection = (selected: boolean): string =>
  `onboarding-choice ${selected ? 'onboarding-choice--selected' : ''}`

/** A miniature app, using fixed preview colors rather than the surrounding theme. */
function ThemePreview({ mode }: { mode: ThemeMode }): React.JSX.Element {
  return (
    <div className={`onboarding-theme-preview onboarding-theme-preview--${mode}`} aria-hidden="true">
      <div className="onboarding-preview-toolbar"><i /><i /><i /></div>
      <div className="onboarding-preview-layout">
        <div className="onboarding-preview-sidebar"><i /><i /><i /></div>
        <div className="onboarding-preview-terminal"><i /><i /><i /><span>_</span></div>
      </div>
    </div>
  )
}

export function Onboarding({ replay = false, onPresetsChanged, onClose }: Props): React.JSX.Element {
  const { t, lang, setLang } = useI18n()
  const { mode, setMode } = useTheme()
  const [step, setStep] = useState(0)
  const [multiple, setMultiple] = useState<boolean | null>(null)
  const [provider, setProvider] = useState<CustomMemoryProvider>('claude')
  const [name, setName] = useState('')
  const [items, setItems] = useState<CustomMemoryPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showUsage, setShowUsage] = useState(true)
  const lock = useRef(false)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const accountInput = useRef<HTMLInputElement>(null)
  const suffix = customMemoryName(name)
  const directory = `.${provider}-${suffix || 'work'}`
  const duplicate = items.some((item) => item.directoryName === directory)

  useEffect(() => {
    let live = true
    setLoading(true)
    setListError(null)
    void window.api.listCustomMemoryPresets().then((memories) => {
      if (live) setItems(memories)
    }).catch((err: unknown) => {
      if (live) setListError(ipcErrorMessage(err))
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [reload])

  useEffect(() => { heading.current?.focus() }, [step])

  useEffect(() => {
    if (busy || !restoreFocus.current) return
    const target = restoreFocus.current
    restoreFocus.current = null
    if (target.isConnected && target !== document.body && !target.matches(':disabled')) target.focus()
    else (accountInput.current ?? heading.current)?.focus()
  }, [busy])

  const run = async (action: () => Promise<void>): Promise<void> => {
    if (lock.current) return
    lock.current = true
    restoreFocus.current = document.activeElement as HTMLElement | null
    setBusy(true)
    setError(null)
    try { await action() } catch (err) { setError(ipcErrorMessage(err)) }
    finally { lock.current = false; setBusy(false) }
  }

  const create = (): void => {
    if (!suffix || duplicate || loading || listError) return
    void run(async () => {
      const result = await window.api.createCustomMemoryPreset(provider, name.trim())
      setItems(result.memories)
      onPresetsChanged(result.presets)
      setNotice(t('onboarding.created', { name: `${provider} ${suffix}` }))
      setName('')
      restoreFocus.current = accountInput.current
    })
  }

  const addExisting = (item: CustomMemoryPreset): void => {
    void run(async () => {
      const result = await window.api.addCustomMemoryTerminalPreset(item.directoryName)
      setItems(result.memories)
      onPresetsChanged(result.presets)
      setNotice(t('onboarding.created', { name: item.aliasName }))
    })
  }

  const finish = (skip = false): void => {
    void run(async () => {
      // Merge the latest preferences: replay must never reset existing selections.
      const settings = await window.api.getSettings()
      const profileIds = !skip && multiple && showUsage
        ? items.filter((item) => item.terminalPresetExists).map((item) => item.id)
        : []
      await window.api.setUiState({
        onboardingCompleted: true,
        ...(profileIds.length ? {
          usageFooterProfiles: [...new Set([
            ...(settings.ui.usageFooterProfiles ?? ['claude:default', 'codex:default']),
            ...profileIds
          ])]
        } : {})
      })
      onClose()
    })
  }

  const next = (): void => { setError(null); setStep((value) => value + 1) }
  const back = (): void => { setError(null); setStep((value) => value - 1) }

  return (
    <Modal
      size="xl"
      title={<span className="onboarding-brand"><span aria-hidden="true">S</span> SUPERIOR <small>{t('onboarding.setup')}</small></span>}
      onClose={onClose}
      dismissable={replay && !busy}
      initialFocusRef={heading}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
          <div className="flex items-center gap-2">
            {step > 0 && <Button variant="ghost" disabled={busy} onClick={back}><ChevronIcon direction="left" />{t('onboarding.back')}</Button>}
            <span className="text-xs text-fgdim">{t('onboarding.step', { current: step + 1, total: 3 })}</span>
          </div>
          <div className="flex items-center gap-2">
            {step === 2 && <Button variant="ghost" disabled={busy} onClick={() => finish(true)}>{t('onboarding.skip')}</Button>}
            <Button
              className="min-w-28"
              loading={busy}
              disabled={step === 2 && (multiple === null || (multiple && (!!name.trim() || loading || !!listError)))}
              onClick={step < 2 ? next : () => finish()}
            >
              {step < 2 ? t('onboarding.next') : t('onboarding.finish')}
              <ChevronIcon direction="right" />
            </Button>
          </div>
        </div>
      }
    >
      <div className="onboarding-grid">
        <aside className="onboarding-story">
          <div className="onboarding-orbit" aria-hidden="true"><span>✳</span><i /><i /></div>
          <p className="onboarding-eyebrow">{t('onboarding.welcome')}</p>
          <h2>{t('onboarding.storyTitle')}</h2>
          <p className="mt-3 text-sm leading-6 text-fgdim">{t('onboarding.storyDescription')}</p>
          <ol className="mt-8 space-y-3" aria-label={t('onboarding.setup')}>
            {STEPS.map((key, index) => (
              <li key={key} className={`flex items-center gap-3 text-sm ${step === index ? 'font-semibold text-fg' : 'text-fgdim'}`} aria-current={step === index ? 'step' : undefined}>
                <span className={`onboarding-step-number ${step >= index ? 'onboarding-step-number--active' : ''}`}>
                  {step > index ? <CheckIcon size={13} /> : `0${index + 1}`}
                </span>
                {t(key)}
              </li>
            ))}
          </ol>
          <p className="mt-8 text-xs leading-5 text-fgdim">{t('onboarding.changeLater')}</p>
        </aside>

        <section className="min-w-0 py-2 sm:px-2" aria-labelledby="onboarding-heading">
          <p className="onboarding-eyebrow">{t(STEPS[step])}</p>
          <h2 id="onboarding-heading" ref={heading} tabIndex={-1} className="mt-2 text-2xl font-semibold tracking-tight text-fg outline-hidden">
            {t(step === 0 ? 'onboarding.languageTitle' : step === 1 ? 'onboarding.themeTitle' : 'onboarding.accountsTitle')}
          </h2>
          <p className="mb-5 mt-2 text-sm leading-6 text-fgdim">
            {t(step === 0 ? 'onboarding.languageDescription' : step === 1 ? 'onboarding.themeDescription' : 'onboarding.accountsDescription')}
          </p>

          {error && <p role="alert" className="mb-4 rounded-lg border border-dangerBorder bg-dangerBg p-3 text-sm text-danger">{error}</p>}

          <fieldset disabled={busy} className="min-w-0 disabled:opacity-70">
            <legend className="sr-only">{t(STEPS[step])}</legend>
            {step === 0 && (
              <div className="space-y-2">
                {LANGUAGES.map((language) => (
                  <button key={language.value} type="button" aria-pressed={lang === language.value} className={`${selection(lang === language.value)} flex w-full items-center gap-4 px-4 py-3 text-left`} onClick={() => void run(() => setLang(language.value))}>
                    <span className="onboarding-language-code">{language.value.toUpperCase()}</span>
                    <span className="flex-1"><span className="block text-sm font-semibold">{language.name}</span><span className="mt-0.5 block text-xs text-fgdim">{language.greeting}</span></span>
                    {lang === language.value && <CheckIcon className="text-accent" size={17} />}
                  </button>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-2 gap-3">
                {THEME_OPTIONS.map((theme) => (
                  <button key={theme.value} type="button" aria-pressed={mode === theme.value} className={`${selection(mode === theme.value)} overflow-hidden p-2 text-left`} onClick={() => void run(() => setMode(theme.value))}>
                    <ThemePreview mode={theme.value} />
                    <span className="flex items-center justify-between gap-2 px-1 pb-1 pt-2 text-xs font-semibold">{t(theme.labelKey)}{mode === theme.value && <CheckIcon size={14} className="text-accent" />}</span>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={multiple === true} onClick={() => setMultiple(true)} className={`${selection(multiple === true)} p-3 text-left`}>
                    <span className="block text-sm font-semibold">{t('onboarding.yes')}</span>
                    <span className="mt-1 block text-xs leading-5 text-fgdim">{t('onboarding.yesDescription')}</span>
                  </button>
                  <button type="button" aria-pressed={multiple === false} onClick={() => setMultiple(false)} className={`${selection(multiple === false)} p-3 text-left`}>
                    <span className="block text-sm font-semibold">{t('onboarding.no')}</span>
                    <span className="mt-1 block text-xs leading-5 text-fgdim">{t('onboarding.noDescription')}</span>
                  </button>
                </div>

                {multiple === false && <div className="rounded-xl border border-statusBorder bg-statusBg p-4 text-sm leading-6 text-fg"><CheckIcon size={20} className="mb-2 text-status" />{t('onboarding.singleAccount')}</div>}

                {multiple && (
                  <>
                    <div className="rounded-xl border border-edge bg-bar/60 p-4">
                      <h3 className="text-sm font-semibold text-fg">{t('onboarding.isolationTitle')}</h3>
                      <p className="mt-1 text-xs leading-5 text-fgdim">{t('onboarding.isolationDescription')}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2" aria-hidden="true">
                        {['personal', 'work'].map((account) => <div key={account} className="rounded-lg border border-edge bg-panel p-2"><FolderIcon className="mb-1 text-accent" /><code className="text-[11px] text-fgdim">~/.{provider}-{account}</code></div>)}
                      </div>
                    </div>

                    {listError ? <div role="alert" className="text-sm text-danger">{listError}<Button variant="secondary" className="mt-2" onClick={() => setReload((value) => value + 1)}>{t('onboarding.retry')}</Button></div> : loading ? <p role="status" className="text-sm text-fgdim">{t('memory.loading')}</p> : (
                      <>
                        <form onSubmit={(event) => { event.preventDefault(); create() }} className="space-y-3 rounded-xl border border-edge p-4">
                          <h3 className="text-sm font-semibold text-fg">{t('onboarding.addAccount')}</h3>
                          <div className="grid grid-cols-2 gap-2">
                            {(['claude', 'codex'] as const).map((value) => (
                              <button key={value} type="button" aria-pressed={provider === value} onClick={() => { setProvider(value); setNotice(null) }} className={`${selection(provider === value)} flex items-center gap-2 p-2.5 text-sm font-medium`}>
                                <PresetIcon iconType="image" icon={builtinIcon(value)?.dataUrl} className="h-6 w-6" />
                                {value === 'claude' ? 'Claude' : 'Codex'}
                              </button>
                            ))}
                          </div>
                          <label htmlFor="onboarding-account-name" className="block text-xs font-medium text-fgdim">{t('onboarding.accountName')}</label>
                          <Input ref={accountInput} id="onboarding-account-name" value={name} maxLength={64} onChange={(event) => { setName(event.target.value); setNotice(null) }} placeholder={t('onboarding.namePlaceholder')} aria-describedby="onboarding-directory" invalid={!!name.trim() && (!suffix || duplicate)} />
                          <div id="onboarding-directory" className="flex min-w-0 items-center gap-2 text-xs text-fgdim"><FolderIcon className="shrink-0 text-accent" /><code className="break-all">~/{directory}</code></div>
                          {name.trim() && (!suffix || duplicate) && <p role="alert" className="text-xs text-danger">{t(duplicate ? 'onboarding.duplicate' : 'onboarding.invalidName')}</p>}
                          <p className="text-xs leading-5 text-fgdim">{t('onboarding.createHint')}</p>
                          <Button type="submit" disabled={!suffix || duplicate} className="w-full"><PlusIcon size={14} />{t('onboarding.createAccount')}</Button>
                        </form>
                        {notice && <p role="status" className="text-xs leading-5 text-status">{notice}</p>}
                        {items.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-fgdim">{t('onboarding.yourAccounts')}</h3>
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-edge p-2.5">
                                <PresetIcon iconType="image" icon={builtinIcon(item.provider)?.dataUrl} className="h-6 w-6 shrink-0" />
                                <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-fg">{item.aliasName}</p><p className="truncate font-mono text-[11px] text-fgdim">~/{item.directoryName}</p></div>
                                {item.terminalPresetExists ? <span className="flex items-center gap-1 text-xs text-status"><CheckIcon size={12} />{t('onboarding.ready')}</span> : <Button size="sm" variant="secondary" onClick={() => addExisting(item)}>{t('onboarding.useExisting')}</Button>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 rounded-lg bg-bar p-3"><span className="text-xs text-fg">{t('onboarding.showUsage')}</span><Toggle checked={showUsage} onChange={setShowUsage} label={t('onboarding.showUsage')} /></div>
                      </>
                    )}
                    <p className="rounded-lg border border-accentBorder bg-accentBg p-3 text-xs leading-5 text-fg">{t('onboarding.signInHint')}</p>
                  </>
                )}
              </div>
            )}
          </fieldset>
        </section>
      </div>
    </Modal>
  )
}
