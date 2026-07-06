import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import AccountInactive from '@/pages/AccountInactive'

type SubStatus = 'ok' | 'suspended' | 'cancelled' | 'trial_expired'

export default function RequireAuth({ children }: { children: JSX.Element }) {
  const [loading, setLoading] = useState(true)
  const [isAuthed, setIsAuthed] = useState(false)
  const [subStatus, setSubStatus] = useState<SubStatus>('ok')
  const loc = useLocation()

  const checkSubscription = async (userId: string) => {
    const { data: user } = await supabase
      .from('users')
      .select('role_key, school_id')
      .eq('id', userId)
      .single()

    // Super admin has no school — always allowed
    if (!user || user.role_key === 'super_admin' || !user.school_id) {
      setSubStatus('ok')
      return
    }

    const { data: school } = await supabase
      .from('schools')
      .select('subscription_status, trial_ends_at')
      .eq('id', user.school_id)
      .single()

    if (!school) { setSubStatus('ok'); return }

    if (school.subscription_status === 'suspended' || school.subscription_status === 'cancelled') {
      setSubStatus(school.subscription_status as SubStatus)
    } else if (school.subscription_status === 'trial' && school.trial_ends_at && new Date(school.trial_ends_at) < new Date()) {
      setSubStatus('trial_expired')
    } else {
      setSubStatus('ok')
    }
  }

  useEffect(() => {
    let cancelled = false
    let authSub: { subscription: { unsubscribe: () => void } } | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const hasAuthParams = () => {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const q = new URLSearchParams(window.location.search)
      return !!(h.get('access_token') || h.get('refresh_token') || q.get('code'))
    }

    const finishAuth = async (userId: string) => {
      if (cancelled) return
      await checkSubscription(userId)
      if (!cancelled) {
        setIsAuthed(true)
        setLoading(false)
      }
    }

    const init = async () => {
      if (hasAuthParams()) {
        timer = setTimeout(() => {
          if (!cancelled) setLoading(false)
        }, 5000)
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (cancelled) return
          if (session) {
            if (timer) clearTimeout(timer)
            finishAuth(session.user.id)
          }
        })
        authSub = sub
        const { data } = await supabase.auth.getSession()
        if (!cancelled && data.session) {
          if (timer) clearTimeout(timer)
          finishAuth(data.session.user.id)
        }
      } else {
        const { data } = await supabase.auth.getSession()
        if (!cancelled) {
          if (data.session) {
            await finishAuth(data.session.user.id)
          } else {
            setLoading(false)
          }
        }
      }
    }

    init()
    return () => {
      cancelled = true
      if (authSub) authSub.subscription.unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>
  if (!isAuthed) return <Navigate to="/login" state={{ from: loc }} replace />
  if (subStatus !== 'ok') return <AccountInactive status={subStatus} />
  return children
}
