import { useEffect, useState } from 'react'
import { THEME_OPTIONS } from '../../themeOptions'
import { useTheme } from '../../theme'
import { useAttentionColor, DEFAULT_ATTENTION_COLOR } from '../../attentionColor'
import { clearUsageStore, primeUsageStore } from '../../usageStore'
import { useUsagePrimary } from '../../usagePrimary'
import { useI18n, LANGUAGES } from '../../i18n'
import { Button, SectionHeader, SegmentedControl, Select, SettingRow, SettingsCard, Toggle } from '../ui'
import { FileOpenerSelect } from './FileOpenerSelect'
import { ThemeCards } from './ThemeCards'
import { GlobalHotkeyRow } from './GlobalHotkeyRow'
import type { AppSettings, FileOpener, UsagePrimary } from '../../types'

const USAGE_PRIMARY_OPTIONS: {
  value: UsagePrimary
  labelKey:
    | 'usage.primaryRemaining'
    | 'usage.primarySevenDay'
    | 'usage.primaryCost'
    | 'usage.primaryTokens'
    | 'usage.primaryContext'
}[] = [
  { value: 'remaining', labelKey: 'usage.primaryRemaining' },
  { value: 'sevenDay', labelKey: 'usage.primarySevenDay' },
  { value: 'cost', labelKey: 'usage.primaryCost' },
  { value: 'tokens', labelKey: 'usage.primaryTokens' },
  { value: 'context', labelKey: 'usage.primaryContext' }
]

/** Loads the persisted settings once; each section reads only its own fields. */
function useSettingsSnapshot(): AppSettings | null {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  useEffect(() => {
    let alive = true
    void window.api.getSettings().then((s) => {
      if (alive) setSettings(s)
    })
    return () => {
      alive = false
    }
  }, [])
  return settings
}

/** Language, notifications, onboarding and the Windows elevation notice. */
export function GeneralSection({ onOpenOnboarding }: { onOpenOnboarding: () => void }): React.JSX.Element {
  const { lang, setLang, t } = useI18n()
  const snapshot = useSettingsSnapshot()
  const [notifications, setNotifications] = useState<boolean | null>(null)
  const [elevationWarning, setElevationWarning] = useState<boolean | null>(null)
  useEffect(() => {
    if (!snapshot) return
    setNotifications(snapshot.notifications)
    setElevationWarning(!snapshot.ui.elevationWarningDismissed)
  }, [snapshot])

  const toggleNotifications = (next: boolean): void => {
    setNotifications(next)
    void window.api.setNotifications(next).then((s) => setNotifications(s.notifications))
  }
  const toggleElevationWarning = (next: boolean): void => {
    setElevationWarning(next)
    void window.api
      .setUiState({ elevationWarningDismissed: !next })
      .then((s) => setElevationWarning(!s.ui.elevationWarningDismissed))
  }

  return (
    <div className="settings-section">
      <SectionHeader title={t('settings.general')} description={t('settings.generalDesc')} />
      <div className="space-y-3">
        <SettingsCard>
          <SettingRow title={t('settings.language')} description={t('language.desc')}>
            <SegmentedControl
              aria-label={t('settings.language')}
              size="sm"
              options={LANGUAGES.map((opt) => ({ value: opt.value, label: opt.label }))}
              value={lang}
              onChange={setLang}
            />
          </SettingRow>
          <GlobalHotkeyRow />
          <SettingRow title={t('onboarding.replayTitle')} description={t('onboarding.replayDescription')}>
            <Button variant="secondary" onClick={onOpenOnboarding}>{t('onboarding.replay')}</Button>
          </SettingRow>
        </SettingsCard>
        <SettingsCard>
          <SettingRow title={t('notify.setting')} description={t('notify.settingDesc')}>
            <Toggle checked={notifications === true} onChange={toggleNotifications} label={t('notify.setting')} />
          </SettingRow>
          {window.api.platform === 'win32' && (
            <SettingRow title={t('elevation.setting')} description={t('elevation.settingDesc')}>
              <Toggle
                checked={elevationWarning === true}
                onChange={toggleElevationWarning}
                label={t('elevation.setting')}
              />
            </SettingRow>
          )}
        </SettingsCard>
      </div>
    </div>
  )
}

/** Theme, accent and attention colors, sidebar tools. */
export function AppearanceSection(): React.JSX.Element {
  const { mode, resolved, setMode, accentColor, setAccentColor } = useTheme()
  const displayedAccent = accentColor ?? (resolved === 'dark' ? '#f08a72' : '#bd5845')
  const { t } = useI18n()
  const { attentionColor, setAttentionColor, resetAttentionColor } = useAttentionColor()
  const isDefaultAttention = attentionColor.toLowerCase() === DEFAULT_ATTENTION_COLOR
  const snapshot = useSettingsSnapshot()
  const [sidebarWorkspaceTools, setSidebarWorkspaceTools] = useState<boolean | null>(null)
  useEffect(() => {
    if (snapshot) setSidebarWorkspaceTools(snapshot.ui.sidebarWorkspaceTools)
  }, [snapshot])

  const toggleSidebarWorkspaceTools = (next: boolean): void => {
    setSidebarWorkspaceTools(next)
    void window.api
      .setUiState({ sidebarWorkspaceTools: next })
      .then((s) => setSidebarWorkspaceTools(s.ui.sidebarWorkspaceTools))
  }

  return (
    <div className="settings-section">
      <SectionHeader title={t('settings.appearance')} description={t('appearance.desc')} />
      <div className="space-y-3">
        <ThemeCards
          label={t('appearance.theme')}
          options={THEME_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }))}
          value={mode}
          onChange={setMode}
        />
        <SettingsCard>
          <SettingRow title={t('appearance.accentColor')} description={t('appearance.accentColorDesc')}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void setAccentColor(null)}
              className={accentColor === null ? 'invisible' : ''}
              aria-hidden={accentColor === null || undefined}
              tabIndex={accentColor === null ? -1 : undefined}
            >
              {t('appearance.resetColor')}
            </Button>
            <span className="font-mono text-xs uppercase text-fgdim">{displayedAccent}</span>
            <label className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-accent bg-accentBg focus-within:ring-2 focus-within:ring-accent/50">
              <span className="h-5 w-5 rounded-full bg-accent" />
              <input
                type="color"
                value={displayedAccent}
                onChange={(e) => void setAccentColor(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label={t('appearance.accentColor')}
              />
            </label>
          </SettingRow>
          <SettingRow title={t('appearance.attentionColor')} description={t('appearance.attentionColorDesc')}>
            {/* invisible (not unmounted) at the default, so the hex label and swatch don't shift */}
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAttentionColor}
              className={isDefaultAttention ? 'invisible' : ''}
              aria-hidden={isDefaultAttention || undefined}
              tabIndex={isDefaultAttention ? -1 : undefined}
            >
              {t('appearance.resetColor')}
            </Button>
            <span className="font-mono text-xs uppercase text-fgdim">{attentionColor}</span>
            <label className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-edge focus-within:ring-2 focus-within:ring-accent/50">
              <span className="attention-pulse-dot h-5 w-5 rounded-full" style={{ ['--attn' as string]: attentionColor }} />
              <input
                type="color"
                value={attentionColor}
                onChange={(e) => setAttentionColor(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label={t('appearance.attentionColor')}
              />
            </label>
          </SettingRow>
        </SettingsCard>
        <SettingsCard>
          <SettingRow
            title={t('appearance.sidebarWorkspaceTools')}
            description={t('appearance.sidebarWorkspaceToolsDesc')}
          >
            <Toggle
              checked={sidebarWorkspaceTools === true}
              onChange={toggleSidebarWorkspaceTools}
              label={t('appearance.sidebarWorkspaceTools')}
            />
          </SettingRow>
        </SettingsCard>
      </div>
    </div>
  )
}

/** Code / Browser workspace modes and the external file opener. */
export function CodeBrowserSection(): React.JSX.Element {
  const { t } = useI18n()
  const snapshot = useSettingsSnapshot()
  const [codeWorkspace, setCodeWorkspace] = useState<boolean | null>(null)
  const [browserWorkspace, setBrowserWorkspace] = useState<boolean | null>(null)
  const [fileOpener, setFileOpenerState] = useState<FileOpener>('system')
  useEffect(() => {
    if (!snapshot) return
    setCodeWorkspace(!snapshot.ui.codeWorkspaceDisabled)
    setBrowserWorkspace(!snapshot.ui.browserWorkspaceDisabled)
    setFileOpenerState(snapshot.fileOpener)
  }, [snapshot])

  const toggleCodeWorkspace = (next: boolean): void => {
    setCodeWorkspace(next)
    void window.api
      .setUiState({ codeWorkspaceDisabled: !next })
      .then((s) => setCodeWorkspace(!s.ui.codeWorkspaceDisabled))
  }
  const toggleBrowserWorkspace = (next: boolean): void => {
    setBrowserWorkspace(next)
    void window.api
      .setUiState({ browserWorkspaceDisabled: !next })
      .then((s) => setBrowserWorkspace(!s.ui.browserWorkspaceDisabled))
  }
  const changeFileOpener = (next: FileOpener): void => {
    setFileOpenerState(next)
    void window.api.setFileOpener(next).then((s) => setFileOpenerState(s.fileOpener))
  }

  return (
    <div className="settings-section">
      <SectionHeader title={t('settings.codeBrowser')} description={t('settings.codeBrowserDesc')} />
      <div className="space-y-3">
        <SettingsCard>
          <SettingRow title={t('workspaceModes.code')} description={t('workspaceModes.codeDesc')}>
            <Toggle checked={codeWorkspace === true} onChange={toggleCodeWorkspace} label={t('workspaceModes.code')} />
          </SettingRow>
          <SettingRow title={t('workspaceModes.browser')} description={t('workspaceModes.browserDesc')}>
            <Toggle
              checked={browserWorkspace === true}
              onChange={toggleBrowserWorkspace}
              label={t('workspaceModes.browser')}
            />
          </SettingRow>
        </SettingsCard>
        <SettingsCard>
          <SettingRow title={t('fileOpener.title')} description={t('fileOpener.desc')}>
            <FileOpenerSelect value={fileOpener} onChange={changeFileOpener} />
          </SettingRow>
        </SettingsCard>
      </div>
    </div>
  )
}

/** Agent status hooks and the usage readout in the topbar. */
export function AgentStatusSection(): React.JSX.Element {
  const { t } = useI18n()
  const { usagePrimary, setUsagePrimary } = useUsagePrimary()
  const snapshot = useSettingsSnapshot()
  const [usageTracking, setUsageTracking] = useState<boolean | null>(null)
  const [agentHooks, setAgentHooksState] = useState<boolean | null>(null)
  useEffect(() => {
    if (!snapshot) return
    setUsageTracking(snapshot.usageTracking)
    setAgentHooksState(snapshot.agentHooks)
  }, [snapshot])

  const toggleAgentHooks = (next: boolean): void => {
    setAgentHooksState(next)
    void window.api.setAgentHooks(next).then((s) => setAgentHooksState(s.agentHooks))
  }
  const toggleUsageTracking = (next: boolean): void => {
    setUsageTracking(next)
    // Reflect the change immediately, then persist (main starts/stops tracking).
    if (next) primeUsageStore()
    else clearUsageStore()
    void window.api.setUsageTracking(next).then((s) => setUsageTracking(s.usageTracking))
  }

  return (
    <div className="settings-section">
      <SectionHeader title={t('settings.agentStatus')} description={t('settings.agentStatusDesc')} />
      <div className="space-y-3">
        {window.api.platform !== 'win32' && (
          <SettingsCard>
            <SettingRow title={t('agentHooks.setting')} description={t('agentHooks.settingDesc')}>
              <Toggle checked={agentHooks === true} onChange={toggleAgentHooks} label={t('agentHooks.setting')} />
            </SettingRow>
          </SettingsCard>
        )}
        <SettingsCard>
          <SettingRow title={t('usage.tracking')} description={t('usage.trackingDesc')}>
            <Toggle checked={usageTracking === true} onChange={toggleUsageTracking} label={t('usage.tracking')} />
          </SettingRow>
          {usageTracking === true && (
            <SettingRow title={t('usage.primary')} description={t('usage.primaryDesc')}>
              {/* Fixed-width wrapper — the Select itself is w-full by design. */}
              <div className="w-56 max-w-full">
                <Select value={usagePrimary} onChange={(e) => setUsagePrimary(e.target.value as UsagePrimary)}>
                  {USAGE_PRIMARY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </Select>
              </div>
            </SettingRow>
          )}
        </SettingsCard>
      </div>
    </div>
  )
}
