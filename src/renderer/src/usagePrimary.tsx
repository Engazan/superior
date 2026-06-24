import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { UsagePrimary } from './types'

/** Kept in sync with the main-process settings default. */
export const DEFAULT_USAGE_PRIMARY: UsagePrimary = 'remaining'

interface UsagePrimaryContextValue {
  /** Which figure the topbar usage badge leads with (hover shows the rest). */
  usagePrimary: UsagePrimary
  setUsagePrimary: (primary: UsagePrimary) => void
}

const UsagePrimaryContext = createContext<UsagePrimaryContextValue | null>(null)

export function UsagePrimaryProvider({ children }: { children: ReactNode }): JSX.Element {
  const [usagePrimary, setState] = useState<UsagePrimary>(DEFAULT_USAGE_PRIMARY)

  // Load the persisted choice once.
  useEffect(() => {
    window.api.getSettings().then((s) => setState(s.usagePrimary))
  }, [])

  const persist = (primary: UsagePrimary): void => {
    setState(primary)
    window.api.setUsagePrimary(primary)
  }

  return (
    <UsagePrimaryContext.Provider value={{ usagePrimary, setUsagePrimary: persist }}>
      {children}
    </UsagePrimaryContext.Provider>
  )
}

export function useUsagePrimary(): UsagePrimaryContextValue {
  const ctx = useContext(UsagePrimaryContext)
  if (!ctx) throw new Error('useUsagePrimary must be used within a UsagePrimaryProvider')
  return ctx
}
