import { useEffect, useState } from 'react'
import { PresetsSection } from './PresetsSection'
import { DaemonsSection } from './DaemonsSection'
import { KeyboardSection } from './KeyboardSection'
import { useTheme } from '../theme'
import { useAttentionColor, DEFAULT_ATTENTION_COLOR } from '../attentionColor'
import { clearUsageStore, primeUsageStore } from '../usageStore'
import { useI18n, LANGUAGES } from '../i18n'
import type { Folder, PresetsState, ThemeMode, TerminalPreset, Workspace } from '../types'

/** A small on/off switch. */
function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-accent' : 'bg-edge'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export type SettingsSection = 'appearance' | 'presets' | 'daemons' | 'keyboard'

interface Props {
  initialSection: SettingsSection
  onBack: () => void
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

const THEME_OPTIONS: { value: ThemeMode; labelKey: 'theme.light' | 'theme.dark' | 'theme.system' }[] =
  [
    { value: 'light', labelKey: 'theme.light' },
    { value: 'dark', labelKey: 'theme.dark' },
    { value: 'system', labelKey: 'theme.system' }
  ]

function AppearanceSection(): JSX.Element {
  const { mode, setMode } = useTheme()
  const { lang, setLang, t } = useI18n()
  const { attentionColor, setAttentionColor, resetAttentionColor } = useAttentionColor()
  const isDefaultAttention = attentionColor.toLowerCase() === DEFAULT_ATTENTION_COLOR

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
    <>
      <h2 className="mb-6 text-lg font-semibold text-fg">{t('settings.appearance')}</h2>

      <section className="mb-8 max-w-md">
        <div className="mb-1.5 text-sm font-medium text-fg">{t('appearance.theme')}</div>
        <p className="mb-3 text-xs text-fgdim">{t('appearance.themeDesc')}</p>
        <div className="inline-flex rounded-lg border border-edge bg-bar p-1">
          {THEME_OPTIONS.map((opt) => {
            const active = mode === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-edge text-fg shadow-sm' : 'text-fgdim hover:text-fg'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            )
          })}
        </div>
      </section>

      <section className="mb-8 max-w-md">
        <div className="mb-1.5 text-sm font-medium text-fg">{t('settings.language')}</div>
        <p className="mb-3 text-xs text-fgdim">{t('language.desc')}</p>
        <div className="inline-flex rounded-lg border border-edge bg-bar p-1">
          {LANGUAGES.map((opt) => {
            const active = lang === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setLang(opt.value)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-edge text-fg shadow-sm' : 'text-fgdim hover:text-fg'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className="max-w-md">
        <div className="mb-1.5 text-sm font-medium text-fg">{t('appearance.attentionColor')}</div>
        <p className="mb-3 text-xs text-fgdim">{t('appearance.attentionColorDesc')}</p>
        <div className="flex items-center gap-3">
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
          <span className="font-mono text-xs uppercase text-fgdim">{attentionColor}</span>
          {!isDefaultAttention && (
            <button
              onClick={resetAttentionColor}
              className="rounded-md px-2 py-1 text-xs text-fgdim transition hover:bg-hover hover:text-fg"
            >
              {t('appearance.resetColor')}
            </button>
          )}
        </div>
      </section>

      <section className="mt-8 max-w-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 text-sm font-medium text-fg">{t('usage.tracking')}</div>
            <p className="text-xs text-fgdim">{t('usage.trackingDesc')}</p>
          </div>
          <Toggle
            checked={usageTracking === true}
            onChange={toggleUsageTracking}
            label={t('usage.tracking')}
          />
        </div>
      </section>
    </>
  )
}

export function SettingsView({
  initialSection,
  onBack,
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
  const [section, setSection] = useState<SettingsSection>(initialSection)
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
        { id: 'presets', label: t('settings.terminalPresets') },
        { id: 'daemons', label: t('settings.daemons'), badge: daemonCount },
        { id: 'keyboard', label: t('settings.keyboard') }
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
      </div>
    </div>
  )
}
