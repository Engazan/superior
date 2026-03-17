import { useState } from 'react'
import { DragStrip } from './DragStrip'
import { PresetsSection } from './PresetsSection'
import { useTheme } from '../theme'
import { useI18n, LANGUAGES } from '../i18n'
import type { ThemeMode, TerminalPreset } from '../types'

export type SettingsSection = 'appearance' | 'presets'

interface Props {
  initialSection: SettingsSection
  onBack: () => void
  presets: TerminalPreset[]
  onSavePreset: (preset: TerminalPreset) => void
  onDeletePreset: (id: string) => void
  onReorderPresets: (orderedIds: string[]) => void
  onTogglePresetActive: (id: string, active: boolean) => void
  onPickPresetImage: () => Promise<{ dataUrl: string } | null>
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
  onPickPresetImage
}: Props): JSX.Element {
  const { t } = useI18n()
  const [section, setSection] = useState<SettingsSection>(initialSection)

  const nav: { id: SettingsSection; label: string }[] = [
    { id: 'appearance', label: t('settings.appearance') },
    { id: 'presets', label: t('settings.terminalPresets') }
  ]

  return (
    <div className="flex min-h-0 flex-1">
      {/* Settings sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-bar">
        <DragStrip />
        <div className="border-b border-edge p-2">
          <button
            onClick={onBack}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-fg transition hover:bg-hover"
          >
            <span className="text-base leading-none">‹</span> {t('settings.back')}
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <ul className="space-y-0.5">
            {nav.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setSection(item.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
                    section === item.id ? 'bg-panel text-fg' : 'text-fgdim hover:bg-panel/60'
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Settings content */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-panel p-6">
        {section === 'appearance' ? (
          <AppearanceSection />
        ) : (
          <PresetsSection
            presets={presets}
            onSave={onSavePreset}
            onDelete={onDeletePreset}
            onReorder={onReorderPresets}
            onToggleActive={onTogglePresetActive}
            onPickImage={onPickPresetImage}
          />
        )}
      </div>
    </div>
  )
}
