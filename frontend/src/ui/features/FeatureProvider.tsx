import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// The effective capability set for the signed-in user, loaded once from the
// `my_features()` RPC (role defaults UNION per-user additive grants; super_admin
// gets the whole catalog). Mirrors the ThemeProvider / LanguageProvider pattern.

type FeatureContextValue = {
  /** Effective capability keys, e.g. 'attendance.record'. */
  features: Set<string>
  /** True until the first load resolves. */
  loading: boolean
  /** Does the user have this capability? Pass an array to mean "any of". */
  can: (key: string | string[]) => boolean
  /** Re-fetch (e.g. after an admin grants a new override). */
  refresh: () => Promise<void>
}

const FeatureContext = createContext<FeatureContextValue>({
  features: new Set(),
  loading: true,
  can: () => false,
  refresh: async () => {},
})

export const FeatureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [features, setFeatures] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setFeatures(new Set())
      setLoading(false)
      return
    }
    const { data, error } = await supabase.rpc('my_features')
    if (error) {
      // Fail closed: no capabilities rather than accidentally granting access.
      // eslint-disable-next-line no-console
      console.error('Failed to load features:', error.message)
      setFeatures(new Set())
    } else {
      setFeatures(new Set((data ?? []) as string[]))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => { load() })
    return () => { sub.subscription.unsubscribe() }
  }, [load])

  const can = useCallback((key: string | string[]) => {
    if (Array.isArray(key)) return key.some(k => features.has(k))
    return features.has(key)
  }, [features])

  return (
    <FeatureContext.Provider value={{ features, loading, can, refresh: load }}>
      {children}
    </FeatureContext.Provider>
  )
}

export function useFeature() {
  return useContext(FeatureContext)
}
