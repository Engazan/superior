import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ThemeMode } from './types'

type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  /** The user's choice: light, dark, system, or transparent (macOS vibrancy). */
  mode: ThemeMode
  /** The concrete theme actually applied (system resolved against the OS). */
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const isMac = window.api.platform === 'darwin'

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [resolved, setResolved] = useState<ResolvedTheme>('dark')

  // Load the persisted choice once.
  useEffect(() => {
    window.api.getSettings().then((s) => setModeState(s.theme))
  }, [])

  // Resolve the mode to a concrete theme and apply it to <html>. Transparent
  // mode follows the OS light/dark (like 'system') and additionally flips the
  // window into macOS vibrancy + translucent chrome via the .transparent class.
  // Gradient mode is always dark-based and paints the app-icon gradient behind
  // frosted chrome purely in CSS (via the .gradient class), so it needs no OS
  // vibrancy and works on every platform. Gradient-light is its light-based twin
  // (same glows, light backdrop) via .gradient + .gradient-light.
  useEffect(() => {
    // Vibrancy only exists on macOS; elsewhere the mode degrades to 'system'.
    const transparent = mode === 'transparent' && isMac
    const gradient = mode === 'gradient'
    const gradientLight = mode === 'gradient-light'
    const apply = (): void => {
      const next =
        mode === 'light' || mode === 'dark'
          ? mode
          : gradient
            ? 'dark'
            : gradientLight
              ? 'light'
              : systemTheme()
      setResolved(next)
      const el = document.documentElement
      el.classList.remove('light', 'dark')
      el.classList.add(next)
      el.classList.toggle('transparent', transparent)
      // Both gradient variants share the .gradient frosting; the light twin adds
      // .gradient-light to override the backdrop and surfaces.
      el.classList.toggle('gradient', gradient || gradientLight)
      el.classList.toggle('gradient-light', gradientLight)
    }
    apply()
    window.api.setWindowVibrancy(transparent)

    // Only 'system' and 'transparent' follow the OS light/dark; the rest are fixed.
    if (mode !== 'system' && mode !== 'transparent') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  const setMode = (next: ThemeMode): void => {
    setModeState(next)
    window.api.setTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
