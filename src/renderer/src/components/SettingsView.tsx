import { useEffect, useState } from 'react'
import { PresetsSection } from './PresetsSection'
import { DaemonsSection } from './DaemonsSection'
import { KeyboardSection } from './KeyboardSection'
import { useTheme } from '../theme'
import { useI18n, LANGUAGES } from '../i18n'
import type { Folder, ThemeMode, TerminalPreset, Workspace } from '../types'

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

      <section className="max-w-md">
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
        <div className="border-b border-edge p-2">
          <button
            onClick={onBack}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-fg transition hover:bg-hover"
          >
            <span className="text-base leading-none">‹</span> {t('settings.back')}
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {groups.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-fgmuted">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setSection(item.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
                        section === item.id ? 'bg-panel text-fg' : 'text-fgdim hover:bg-panel/60'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-[11px] font-semibold text-emerald-400">
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
