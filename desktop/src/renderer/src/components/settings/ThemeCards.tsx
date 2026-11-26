import type { ThemeMode } from '../../types'

/** Miniature window colors per theme: backdrop, sidebar, line, accent. */
const PREVIEWS: Record<ThemeMode, { bg: string; side: string; line: string; accent: string }> = {
  dark: { bg: '#0b0e14', side: '#0f131a', line: '#2d3542', accent: '#f08a72' },
  light: { bg: '#f4f6f9', side: '#f1f3f7', line: '#d3d9e2', accent: '#3550c8' },
  system: { bg: 'linear-gradient(90deg,#0b0e14 50%,#f4f6f9 50%)', side: 'transparent', line: '#8a93a3', accent: '#f08a72' },
  gradient: {
    bg: 'linear-gradient(120deg,#2a9fe0,#4b2ad6 32%,#9a1fd0 58%,#ec2a86 80%,#f8931f)',
    side: 'rgba(15,19,26,.55)',
    line: 'rgba(255,255,255,.35)',
    accent: '#ffffff'
  },
  'gradient-light': {
    bg: 'linear-gradient(120deg,#bfe3f7,#cfc4f6 40%,#f4c4dd 75%,#fde0bd)',
    side: 'rgba(255,255,255,.55)',
    line: 'rgba(23,27,34,.25)',
    accent: '#3550c8'
  },
  transparent: { bg: 'rgba(127,127,127,.18)', side: 'rgba(127,127,127,.18)', line: 'rgba(127,127,127,.5)', accent: '#f08a72' }
}

interface Props {
  label: string
  options: { value: ThemeMode; label: string }[]
  value: ThemeMode
  onChange: (next: ThemeMode) => void
}

/** Theme picker drawn as preview cards; a radio group for assistive tech. */
export function ThemeCards({ label, options, value, onChange }: Props): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map((opt) => {
        const p = PREVIEWS[opt.value]
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`flex flex-col gap-2.5 rounded-xl border bg-panel p-2.5 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
              selected ? 'border-accent ring-1 ring-accent' : 'border-edge hover:border-fgmuted'
            }`}
          >
            <span
              aria-hidden
              className="flex h-20 overflow-hidden rounded-lg border border-edge"
              style={{ background: p.bg }}
            >
              <span className="w-[30%] border-r" style={{ background: p.side, borderColor: p.line }} />
              <span className="flex flex-1 flex-col gap-1.5 p-2.5">
                <span className="h-1.5 w-[70%] rounded-full" style={{ background: p.line }} />
                <span className="h-1.5 w-[45%] rounded-full" style={{ background: p.accent }} />
                <span className="h-1.5 w-[60%] rounded-full" style={{ background: p.line }} />
              </span>
            </span>
            <span className="flex items-center gap-2 px-0.5">
              <span className="flex-1 text-sm font-semibold text-fg">{opt.label}</span>
              <span
                aria-hidden
                className={`grid h-4 w-4 place-items-center rounded-full border-[1.5px] ${selected ? 'border-accent' : 'border-edge'}`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
