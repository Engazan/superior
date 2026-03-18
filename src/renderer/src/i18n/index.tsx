import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Language } from '../types'
import { en, type MessageKey } from './locales/en'
import { sk } from './locales/sk'
import { cs } from './locales/cs'
import { pl } from './locales/pl'
import { hu } from './locales/hu'

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'En' },
  { value: 'sk', label: 'Sk' },
  { value: 'cs', label: 'Cz' },
  { value: 'pl', label: 'Pl' },
  { value: 'hu', label: 'Hu' }
]

const messages: Record<Language, Record<MessageKey, string>> = { en, sk, cs, pl, hu }

export type { MessageKey }
export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: TFunction
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Language>('en')

  useEffect(() => {
    window.api.getSettings().then((s) => setLangState(s.language))
  }, [])

  const setLang = (next: Language): void => {
    setLangState(next)
    window.api.setLanguage(next)
  }

  const t: TFunction = (key, params) => {
    let str = (messages[lang] ?? en)[key] ?? en[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) str = str.replace(`{${k}}`, String(v))
    }
    return str
  }

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}
