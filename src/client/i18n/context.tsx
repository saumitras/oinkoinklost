import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { I18N_VERSION, SEED_TRANSLATIONS, STRINGS, type StringKey } from './strings'

const LANGUAGE_KEY = 'oinkoink_language'
const languageRequests = new Map<string, Promise<Record<string, string>>>()

interface I18nContextValue {
  languageCode: string
  setLanguageCode: (languageCode: string) => void
  t: (key: StringKey, values?: Record<string, string | number>) => string
  ready: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

function cacheKey(languageCode: string) {
  return `oinkoink_i18n_${languageCode}_${I18N_VERSION}`
}

function fetchLanguage(languageCode: string) {
  const existing = languageRequests.get(languageCode)
  if (existing) return existing
  const request = fetch('/api/i18n/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLanguage: languageCode, strings: STRINGS }),
  }).then(async response => {
    if (!response.ok) throw new Error('translation unavailable')
    const result: { translations: Record<string, string> } = await response.json()
    return result.translations
  })
  languageRequests.set(languageCode, request)
  return request
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [languageCode, setLanguageState] = useState(() => localStorage.getItem(LANGUAGE_KEY) || 'en-IN')
  const [dictionary, setDictionary] = useState<Record<string, string>>(
    SEED_TRANSLATIONS[localStorage.getItem(LANGUAGE_KEY) || 'en-IN'] as Record<string, string> || {},
  )
  const [ready, setReady] = useState(true)

  const loadLanguage = useCallback(async (next: string) => {
    if (next === 'en-IN') {
      setDictionary({})
      setReady(true)
      return
    }
    const seeded = SEED_TRANSLATIONS[next] as Record<string, string> | undefined
    const cached = localStorage.getItem(cacheKey(next))
    if (cached) {
      try { setDictionary(JSON.parse(cached)); setReady(true) } catch { /* ignore */ }
    } else if (seeded) {
      setDictionary(seeded)
      setReady(true)
    } else {
      setDictionary({})
      setReady(false)
    }
    try {
      const translations = await fetchLanguage(next)
      const merged = { ...(seeded ?? {}), ...translations }
      setDictionary(merged)
      localStorage.setItem(cacheKey(next), JSON.stringify(merged))
    } catch {
      if (!seeded && !cached) setDictionary({})
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => { loadLanguage(languageCode) }, [languageCode, loadLanguage])

  const setLanguageCode = useCallback((next: string) => {
    setLanguageState(next)
    localStorage.setItem(LANGUAGE_KEY, next)
    document.documentElement.lang = next.split('-')[0]
  }, [])

  const t = useCallback((key: StringKey, values: Record<string, string | number> = {}) => {
    let value = (dictionary[key] ?? STRINGS[key] ?? key).replace(/```/g, '').trim()
    for (const [name, replacement] of Object.entries(values)) {
      value = value.split(`{${name}}`).join(String(replacement))
    }
    return value
  }, [dictionary])

  const value = useMemo(
    () => ({ languageCode, setLanguageCode, t, ready }),
    [languageCode, setLanguageCode, t, ready],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
