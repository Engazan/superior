import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { DEFAULT_TERMINAL_SETTINGS, TERMINAL_ENUM_OPTIONS, TERMINAL_NUMBER_LIMITS, type TerminalSettings } from '@shared/terminalSettings'
import { loadTerminalSettings, saveTerminalSettings, useTerminalSettings } from '../terminalSettingsStore'
import { terminalOptions, terminalPalette } from '../terminalAppearance'
import { createTerminalRendering } from '../terminalRendering'
import { useTheme } from '../theme'
import { useI18n, type MessageKey } from '../i18n'
import { Button, Input, SectionHeader, Select, SettingRow, SettingsCard, Toggle } from './ui'

function TerminalPreview({ settings }: { settings: TerminalSettings }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const rendering = useRef<ReturnType<typeof createTerminalRendering> | null>(null)
  const { resolved } = useTheme()
  const mode = settings.theme === 'app' ? resolved : settings.theme
  const { t } = useI18n()
  useEffect(() => {
    if (!host.current) return
    const term = new Terminal({ allowProposedApi: true, scrollback: 100, cursorInactiveStyle: 'outline' })
    const fitter = new FitAddon()
    term.loadAddon(fitter)
    term.open(host.current)
    terminal.current = term
    fit.current = fitter
    rendering.current = createTerminalRendering(term)
    term.write('\x1b[32m✓\x1b[0m Superior  \x1b[1mTerminal preview\x1b[0m\r\n\x1b[36m~/project\x1b[0m $ agent\r\n\x1b[33mReview\x1b[0m  \x1b[31m- previous\x1b[0m  \x1b[32m+ updated\x1b[0m\r\n\x1b[2mDim text\x1b[0m  => != === ->  á č š ž €\r\n$ ')
    // A local echo makes the preview usable without creating a real shell.
    const input = term.onData(data => {
      if (data === '\r') term.write('\r\n$ ')
      else if (data === '\x7f') { if (term.buffer.active.cursorX > 2) term.write('\b \b') }
      else term.write(data.replace(/[\x00-\x1f\x7f]/g, ''))
    })
    const resize = (): void => { try { fitter.fit() } catch { /* unmounted */ } }
    const observer = new ResizeObserver(resize)
    observer.observe(host.current)
    resize()
    return () => {
      observer.disconnect(); input.dispose(); rendering.current?.dispose(); term.dispose()
      terminal.current = null; rendering.current = null; fit.current = null
    }
  }, [])
  useEffect(() => {
    if (!terminal.current) return
    terminal.current.options = { ...terminalOptions(settings, mode), scrollback: 100 }
    void rendering.current?.update(settings)
    fit.current?.fit()
    let cancelled = false
    void document.fonts.ready.then(() => { if (!cancelled) fit.current?.fit() })
    return () => { cancelled = true }
  }, [settings, mode])
  return <div className="overflow-hidden rounded-xl border border-edge">
    <div className="bg-bar px-4 py-2 text-xs font-medium text-fgdim">{t('terminalSettings.preview')}</div>
    <div ref={host} data-terminal-settings-preview aria-label={t('terminalSettings.preview')}
      className="h-48 overflow-hidden p-3" style={{ background: terminalPalette(settings, mode).background }} />
  </div>
}

/** Keep intermediate input (empty, a decimal point, etc.) until committed. */
function ValueInput({ value, onCommit, ...props }: {
  value: string | number
  onCommit: (value: string) => void
  'aria-label': string
  type?: string
  min?: number
  max?: number
  step?: number
  maxLength?: number
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const [previous, setPrevious] = useState(value)
  if (previous !== value) { setPrevious(value); setDraft(String(value)) }
  const commit = (): void => {
    if (draft !== String(value)) onCommit(draft)
    setDraft(String(value))
  }
  return <Input {...props} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} />
}

export function TerminalSettingsSection(): React.JSX.Element {
  const { settings, loaded, pending, error } = useTerminalSettings()
  const { t } = useI18n()
  const label = (key: string): string => t(`terminalSettings.${key}` as MessageKey)
  const change = (patch: Partial<TerminalSettings>): void => { void saveTerminalSettings(patch) }
  const numberRow = (key: keyof typeof TERMINAL_NUMBER_LIMITS, hint?: MessageKey): React.JSX.Element => {
    const [min, max, step] = TERMINAL_NUMBER_LIMITS[key]
    return <SettingRow key={key} title={label(key)} description={hint ? t(hint) : undefined}>
      <div className="w-28"><ValueInput aria-label={label(key)} type="number" min={min} max={max} step={step}
        value={settings[key]} onCommit={value => {
          if (value.trim() && Number.isFinite(Number(value))) change({ [key]: Number(value) })
        }} /></div>
    </SettingRow>
  }
  const enumRow = (key: keyof typeof TERMINAL_ENUM_OPTIONS, hint?: MessageKey): React.JSX.Element =>
    <SettingRow key={key} title={label(key)} description={hint ? t(hint) : undefined}>
      <div className="w-44"><Select aria-label={label(key)} value={settings[key]} onChange={e => change({ [key]: e.target.value })}>
        {TERMINAL_ENUM_OPTIONS[key].map(option => <option key={option} value={option}>{label(option)}</option>)}
      </Select></div>
    </SettingRow>
  const toggleRow = (key: 'cursorBlink' | 'copyOnSelect' | 'rightClickToPaste' | 'focusFollowsMouse' | 'allowOsc52Clipboard', hint?: MessageKey): React.JSX.Element =>
    <SettingRow key={key} title={label(key)} description={hint ? t(hint) : undefined}>
      <Toggle label={label(key)} checked={settings[key]} onChange={value => change({ [key]: value })} />
    </SettingRow>
  return <div className="settings-section">
    <SectionHeader title={label('title')} description={label('description')} />
    {error && <div role="alert" className="mb-3 text-sm text-danger">
      {label('error')}
      {!loaded && <Button onClick={() => void loadTerminalSettings()}>{label('retry')}</Button>}
    </div>}
    {!loaded ? <p role="status">{label('loading')}</p> : <div className="space-y-5">
      <TerminalPreview settings={settings} />
      <h3 className="text-sm font-semibold">{label('typography')}</h3>
      <SettingsCard>
        <SettingRow title={label('fontFamily')} description={label('fontHint')}>
          <div className="w-64 max-w-full"><ValueInput aria-label={label('fontFamily')} maxLength={256} value={settings.fontFamily}
            onCommit={value => change({ fontFamily: value })} /></div>
        </SettingRow>
        {numberRow('fontSize')}{numberRow('fontWeight')}{numberRow('fontWeightBold')}{numberRow('lineHeight')}
        {enumRow('ligatures', 'terminalSettings.ligatureHint')}{enumRow('cursorStyle')}{toggleRow('cursorBlink')}{numberRow('cursorOpacity')}
      </SettingsCard>
      <h3 className="text-sm font-semibold">{label('appearance')}</h3>
      <SettingsCard>
        {enumRow('theme')}{enumRow('darkTheme')}{enumRow('lightTheme')}
        {numberRow('minimumContrastRatio', 'terminalSettings.contrastHint')}{numberRow('inactivePaneOpacity')}
      </SettingsCard>
      <h3 className="text-sm font-semibold">{label('interaction')}</h3>
      <SettingsCard>
        {numberRow('scrollback', 'terminalSettings.historyHint')}{numberRow('scrollSensitivity')}
        {numberRow('fastScrollSensitivity')}{numberRow('tuiScrollSensitivity')}
        {toggleRow('copyOnSelect')}{toggleRow('rightClickToPaste', 'terminalSettings.pasteHint')}
        {toggleRow('focusFollowsMouse')}{toggleRow('allowOsc52Clipboard', 'terminalSettings.oscHint')}
      </SettingsCard>
      <h3 className="text-sm font-semibold">{label('advanced')}</h3>
      <SettingsCard>
        {window.api.platform === 'darwin' && enumRow('macOptionAsAlt', 'terminalSettings.optionHint')}
        {enumRow('gpuAcceleration', 'terminalSettings.gpuHint')}
      </SettingsCard>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => change(DEFAULT_TERMINAL_SETTINGS)}>{label('reset')}</Button>
        <span role="status" className="text-xs text-fgdim">{pending > 0 ? label('saving') : ''}</span>
      </div>
    </div>}
  </div>
}
