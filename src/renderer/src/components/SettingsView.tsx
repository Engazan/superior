import { DragStrip } from './DragStrip'
import { useTheme } from '../theme'
import type { ThemeMode } from '../types'

interface Props {
  onBack: () => void
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
]

export function SettingsView({ onBack }: Props): JSX.Element {
  const { mode, setMode } = useTheme()

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
            <span className="text-base leading-none">‹</span> Back
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <ul className="space-y-0.5">
            <li>
              <div className="rounded-md bg-panel px-2 py-1.5 text-sm font-medium text-fg">
                Appearance
              </div>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Settings content */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-panel p-6">
        <h2 className="mb-6 text-lg font-semibold text-fg">Appearance</h2>

        <section className="max-w-md">
          <div className="mb-1.5 text-sm font-medium text-fg">Theme</div>
          <p className="mb-3 text-xs text-fgdim">
            Choose how Superior looks. System follows your operating system setting.
          </p>
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
                  {opt.label}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
