/** Persisted terminal preferences. Shared by validation, renderer and preview. */
export interface TerminalSettings {
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontWeightBold: number
  lineHeight: number
  ligatures: 'auto' | 'on' | 'off'
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  cursorOpacity: number
  theme: 'app' | 'dark' | 'light'
  darkTheme: 'superior' | 'dracula' | 'solarized'
  lightTheme: 'superior' | 'solarized'
  minimumContrastRatio: number
  inactivePaneOpacity: number
  scrollback: number
  scrollSensitivity: number
  fastScrollSensitivity: number
  tuiScrollSensitivity: number
  macOptionAsAlt: 'auto' | 'both' | 'left' | 'right' | 'off'
  gpuAcceleration: 'auto' | 'on' | 'off'
  copyOnSelect: boolean
  rightClickToPaste: boolean
  focusFollowsMouse: boolean
  allowOsc52Clipboard: boolean
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: 13,
  fontWeight: 400, fontWeightBold: 700, lineHeight: 1,
  ligatures: 'auto', cursorStyle: 'block', cursorBlink: true, cursorOpacity: 1,
  theme: 'app', darkTheme: 'superior', lightTheme: 'superior', minimumContrastRatio: 1,
  inactivePaneOpacity: 1, scrollback: 10_000, scrollSensitivity: 1,
  fastScrollSensitivity: 5, tuiScrollSensitivity: 1, macOptionAsAlt: 'auto',
  gpuAcceleration: 'auto', copyOnSelect: false, rightClickToPaste: false,
  focusFollowsMouse: false, allowOsc52Clipboard: false
}

export const TERMINAL_NUMBER_LIMITS = {
  fontSize: [8, 40, 1], fontWeight: [100, 900, 100], fontWeightBold: [100, 900, 100],
  lineHeight: [1, 2, 0.05], cursorOpacity: [0.2, 1, 0.05], minimumContrastRatio: [1, 21, 0.5],
  inactivePaneOpacity: [0.3, 1, 0.05], scrollback: [1000, 100_000, 1000],
  scrollSensitivity: [0.5, 3, 0.05], fastScrollSensitivity: [1, 10, 0.5], tuiScrollSensitivity: [1, 10, 1]
} as const

export const TERMINAL_ENUM_OPTIONS = {
  ligatures: ['auto', 'on', 'off'], cursorStyle: ['block', 'bar', 'underline'],
  theme: ['app', 'dark', 'light'], darkTheme: ['superior', 'dracula', 'solarized'],
  lightTheme: ['superior', 'solarized'], macOptionAsAlt: ['auto', 'both', 'left', 'right', 'off'],
  gpuAcceleration: ['auto', 'on', 'off']
} as const

/** Unknown keys and invalid values never reach xterm or the settings file. */
export function normalizeTerminalSettings(raw: unknown, base = DEFAULT_TERMINAL_SETTINGS): TerminalSettings {
  const next = { ...base }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return next
  const obj = raw as Record<string, unknown>
  for (const key of Object.keys(base) as (keyof TerminalSettings)[]) {
    const value = obj[key]
    if (key === 'fontFamily') {
      if (typeof value === 'string' && value.trim() && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value)) next.fontFamily = value.trim()
    } else if (key in TERMINAL_NUMBER_LIMITS) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const [min, max, step] = TERMINAL_NUMBER_LIMITS[key as keyof typeof TERMINAL_NUMBER_LIMITS]
      const bounded = Math.min(max, Math.max(min, value))
      Object.assign(next, { [key]: Number((min + Math.round((bounded - min) / step) * step).toFixed(2)) })
    } else if (key in TERMINAL_ENUM_OPTIONS) {
      const choices: readonly string[] = TERMINAL_ENUM_OPTIONS[key as keyof typeof TERMINAL_ENUM_OPTIONS]
      if (typeof value === 'string' && choices.includes(value)) Object.assign(next, { [key]: value })
    } else if (typeof value === 'boolean') Object.assign(next, { [key]: value })
  }
  return next
}
