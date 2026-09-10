import type { ThemeMode } from './types'

export const THEME_OPTIONS: {
  value: ThemeMode
  labelKey:
    | 'theme.light'
    | 'theme.dark'
    | 'theme.system'
    | 'theme.transparent'
    | 'theme.gradient'
    | 'theme.gradientLight'
}[] = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
  { value: 'system', labelKey: 'theme.system' },
  // The app-icon gradient with frosted chrome — pure CSS, so it works everywhere.
  { value: 'gradient', labelKey: 'theme.gradient' },
  // Its light-based twin: same glows over a bright backdrop.
  { value: 'gradient-light', labelKey: 'theme.gradientLight' },
  // Vibrancy (blur-behind) exists only on macOS.
  ...(window.api.platform === 'darwin'
    ? ([{ value: 'transparent', labelKey: 'theme.transparent' }] as const)
    : [])
]

