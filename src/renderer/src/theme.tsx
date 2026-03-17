import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ThemeMode } from './types'

type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  /** The user's choice: light, dark, or system. */
  mode: ThemeMode
  /** The concrete theme actually applied (system resolved against the OS). */
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

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

  // Resolve the mode to a concrete theme and apply it to <html>.
  useEffect(() => {
    const apply = (): void => {
      const next = mode === 'system' ? systemTheme() : mode
      setResolved(next)
      const el = document.documentElement
      el.classList.remove('light', 'dark')
      el.classList.add(next)
    }
    apply()

    if (mode !== 'system') return
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
