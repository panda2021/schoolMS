import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Loads the signed-in user's role_key once (mirrors FeatureProvider) so route
// guards can gate pages without each guard re-querying the DB.

export type Role = 'super_admin' | 'school_admin' | 'teacher' | 'parent' | 'pending'

type RoleContextValue = { role: Role | null; loading: boolean }

const RoleContext = createContext<RoleContextValue>({ role: null, loading: true })

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) { setRole(null); setLoading(false) } return }
      const { data } = await supabase.from('users').select('role_key').eq('id', user.id).maybeSingle()
      if (!cancelled) { setRole((data?.role_key as Role) ?? 'pending'); setLoading(false) }
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => load())
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [])

  return <RoleContext.Provider value={{ role, loading }}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext)
}
