import { useEffect, useState } from 'react'
import { PresetsSection } from './PresetsSection'
import { DaemonsSection } from './DaemonsSection'
import { KeyboardSection } from './KeyboardSection'
import { IntegrationsSection } from './IntegrationsSection'
import { ShellCommandSection } from './ShellCommandSection'
import { useTheme } from '../theme'
import { useAttentionColor, DEFAULT_ATTENTION_COLOR } from '../attentionColor'
import { clearUsageStore, primeUsageStore } from '../usageStore'
import { useUsagePrimary } from '../usagePrimary'
import { useI18n, LANGUAGES } from '../i18n'
import { Button, SectionHeader, SegmentedControl, Select, SettingRow, SettingsCard, Toggle } from './ui'
import type {
  Folder,
  PresetsState,
  ThemeMode,
  TerminalPreset,
  UsagePrimary,
  Workspace
} from '../types'

export type SettingsSection =
  | 'appearance'
  | 'integrations'
  | 'presets'
  | 'daemons'
  | 'keyboard'
  | 'shell'

interface Props {
  initialSection: SettingsSection
  /** Reports section switches so the last section can be restored on reopen. */
  onSectionChange?: (section: SettingsSection) => void
  onBack: () => void
  /** Called after the user adds/edits/removes an integration, so the sidebar's
   *  clone affordance can refresh. */
  onIntegrationsChanged?: () => void
  presets: TerminalPreset[]
  onSavePreset: (preset: TerminalPreset) => void
  onDeletePreset: (id: string) => void
  onReorderPresets: (orderedIds: string[]) => void
  onTogglePresetActive: (id: string, active: boolean) => void
  onPickPresetImage: () => Promise<{ dataUrl: string } | null>
  onPresetsChanged: (state: PresetsState) => void
  workspaces: Workspace[]
  folders: Folder[]
  onKillSession: (id: string) => void
}

const THEME_OPTIONS: {
  value: ThemeMode
  labelKey: 'theme.light' | 'theme.dark' | 'theme.system' | 'theme.transparent'
}[] = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
  { value: 'system', labelKey: 'theme.system' },
  // Vibrancy (blur-behind) exists only on macOS.
  ...(window.api.platform === 'darwin'
    ? ([{ value: 'transparent', labelKey: 'theme.transparent' }] as const)
    : [])
]

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

function AppearanceSection(): JSX.Element {
  const { mode, setMode } = useTheme()
  const { lang, setLang, t } = useI18n()
  const { attentionColor, setAttentionColor, resetAttentionColor } = useAttentionColor()
  const isDefaultAttention = attentionColor.toLowerCase() === DEFAULT_ATTENTION_COLOR
  const { usagePrimary, setUsagePrimary } = useUsagePrimary()

  const [usageTracking, setUsageTracking] = useState<boolean | null>(null)
  useEffect(() => {
    window.api.getSettings().then((s) => setUsageTracking(s.usageTracking))
  }, [])

  const toggleUsageTracking = (next: boolean): void => {
    setUsageTracking(next)
    // Reflect the change immediately, then persist (main starts/stops tracking).
    if (next) primeUsageStore()
    else clearUsageStore()
    window.api.setUsageTracking(next).then((s) => setUsageTracking(s.usageTracking))
  }

  return (
    <div className="max-w-2xl">
      <SectionHeader title={t('settings.appearance')} description={t('appearance.desc')} />

      <SettingsCard>
        <SettingRow title={t('appearance.theme')} description={t('appearance.themeDesc')}>
          <SegmentedControl
            aria-label={t('appearance.theme')}
            size="sm"
            options={THEME_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }))}
            value={mode}
            onChange={setMode}
          />
        </SettingRow>

        <SettingRow title={t('settings.language')} description={t('language.desc')}>
          <SegmentedControl
            aria-label={t('settings.language')}
            size="sm"
            options={LANGUAGES.map((opt) => ({ value: opt.value, label: opt.label }))}
            value={lang}
            onChange={setLang}
          />
        </SettingRow>

        <SettingRow
          title={t('appearance.attentionColor')}
          description={t('appearance.attentionColorDesc')}
        >
          {!isDefaultAttention && (
            <Button variant="ghost" size="sm" onClick={resetAttentionColor}>
              {t('appearance.resetColor')}
            </Button>
          )}
          <span className="font-mono text-xs uppercase text-fgdim">{attentionColor}</span>
          <label className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-edge">
            <span
              className="attention-pulse-dot h-5 w-5 rounded-full"
              style={{ ['--attn' as string]: attentionColor }}
            />
            <input
              type="color"
              value={attentionColor}
              onChange={(e) => setAttentionColor(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={t('appearance.attentionColor')}
            />
          </label>
        </SettingRow>

        <SettingRow title={t('usage.tracking')} description={t('usage.trackingDesc')}>
          <Toggle
            checked={usageTracking === true}
            onChange={toggleUsageTracking}
            label={t('usage.tracking')}
          />
        </SettingRow>

        {usageTracking === true && (
          <SettingRow title={t('usage.primary')} description={t('usage.primaryDesc')}>
            {/* Fixed-width wrapper — the Select itself is w-full by design. */}
            <div className="w-56">
              <Select
                value={usagePrimary}
                onChange={(e) => setUsagePrimary(e.target.value as UsagePrimary)}
              >
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
  )
}

export function SettingsView({
  initialSection,
  onSectionChange,
  onBack,
  onIntegrationsChanged,
  presets,
  onSavePreset,
  onDeletePreset,
  onReorderPresets,
  onTogglePresetActive,
  onPickPresetImage,
  onPresetsChanged,
  workspaces,
  folders,
  onKillSession
}: Props): JSX.Element {
  const { t } = useI18n()
  const [section, setSectionState] = useState<SettingsSection>(initialSection)
  // Report section changes up so the app can reopen settings where you left off.
  const setSection = (next: SettingsSection): void => {
    setSectionState(next)
    onSectionChange?.(next)
  }
  const [daemonCount, setDaemonCount] = useState(0)

  // Poll the live daemon sessions so the nav badge stays current.
  useEffect(() => {
    let active = true
    const refresh = async (): Promise<void> => {
      const sessions = await window.api.restoreSessions()
      if (active) setDaemonCount(sessions.length)
    }
    refresh()
    const id = window.setInterval(refresh, 2500)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [])

  const groups: {
    label: string
    items: { id: SettingsSection; label: string; badge?: number }[]
  }[] = [
    {
      label: t('settings.personal'),
      items: [{ id: 'appearance', label: t('settings.appearance') }]
    },
    {
      label: t('settings.workflow'),
      items: [
        { id: 'integrations', label: t('settings.integrations') },
        { id: 'presets', label: t('settings.terminalPresets') },
        { id: 'daemons', label: t('settings.daemons'), badge: daemonCount },
        { id: 'keyboard', label: t('settings.keyboard') },
        { id: 'shell', label: t('settings.shellCommand') }
      ]
    }
  ]

  return (
    <div className="flex min-h-0 flex-1">
      {/* Settings sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-bar">
        <div className="border-b border-edge px-2 py-2">
          <button
            onClick={onBack}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-fgdim transition hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="text-base leading-none text-accent">‹</span>
            {t('settings.back')}
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-fgmuted">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setSection(item.id)}
                      className={`relative flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
                        section === item.id
                          ? 'bg-accentBg text-fg'
                          : 'text-fgdim hover:bg-hover hover:text-fg'
                      }`}
                    >
                      {section === item.id && (
                        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                      )}
                      <span>{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-statusBg px-1.5 text-[10px] font-bold text-status ring-1 ring-inset ring-statusBorder">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Settings content */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-panel p-6">
        {section === 'appearance' && <AppearanceSection />}
        {section === 'integrations' && (
          <IntegrationsSection onChanged={onIntegrationsChanged} />
        )}
        {section === 'presets' && (
          <PresetsSection
            presets={presets}
            onSave={onSavePreset}
            onDelete={onDeletePreset}
            onReorder={onReorderPresets}
            onToggleActive={onTogglePresetActive}
            onPickImage={onPickPresetImage}
            onPresetsChanged={onPresetsChanged}
          />
        )}
        {section === 'daemons' && (
          <DaemonsSection workspaces={workspaces} folders={folders} onKill={onKillSession} />
        )}
        {section === 'keyboard' && <KeyboardSection />}
        {section === 'shell' && <ShellCommandSection />}
      </div>
    </div>
  )
}
