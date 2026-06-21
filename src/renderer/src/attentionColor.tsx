import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** Catppuccin peach — kept in sync with the main-process settings default. */
export const DEFAULT_ATTENTION_COLOR = '#fab387'

interface AttentionColorContextValue {
  /** Hex color a workspace tab pulses with when one of its terminals finishes. */
  attentionColor: string
  setAttentionColor: (color: string) => void
  resetAttentionColor: () => void
}

const AttentionColorContext = createContext<AttentionColorContextValue | null>(null)

export function AttentionColorProvider({ children }: { children: ReactNode }): JSX.Element {
  const [attentionColor, setColorState] = useState<string>(DEFAULT_ATTENTION_COLOR)

  // Load the persisted choice once.
  useEffect(() => {
    window.api.getSettings().then((s) => setColorState(s.attentionColor))
  }, [])

  const persist = (color: string): void => {
    setColorState(color)
    window.api.setAttentionColor(color)
  }

  return (
    <AttentionColorContext.Provider
      value={{
        attentionColor,
        setAttentionColor: persist,
        resetAttentionColor: () => persist(DEFAULT_ATTENTION_COLOR)
      }}
    >
      {children}
    </AttentionColorContext.Provider>
  )
}

export function useAttentionColor(): AttentionColorContextValue {
  const ctx = useContext(AttentionColorContext)
  if (!ctx) throw new Error('useAttentionColor must be used within an AttentionColorProvider')
  return ctx
}
