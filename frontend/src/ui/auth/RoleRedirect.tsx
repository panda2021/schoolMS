import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

export default function RoleRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login', { replace: true }); return }

      // Try to load profile first
      let { data } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()

      // Provision / repair the profile when it's missing, awaiting approval, or
      // a legacy 'parent with no school' stub. ensure_user_profile() consumes a
      // matching pending invitation if one exists (0030), so an invited
      // 'pending' user is upgraded on their next login.
      const needsEnsure = !data?.role_key
        || data.role_key === 'pending'
        || (data.role_key === 'parent' && !data.school_id)
      if (needsEnsure) {
        const { data: ensured, error } = await supabase.rpc('ensure_user_profile')
        if (error) {
          console.error('ensure_user_profile failed:', error)
        } else if (ensured && ensured.length > 0) {
          data = ensured[0]
        }
      }

      const role = data?.role_key
      if (role === 'super_admin') navigate('/app/super', { replace: true })
      else if (role === 'school_admin') navigate('/app/admin', { replace: true })
      else if (role === 'teacher') navigate('/app/teacher', { replace: true })
      else if (role === 'parent') navigate('/app/parent', { replace: true })
      // 'pending' (no invitation matched, D2) or anything unknown: approval screen
      else navigate('/app/pending', { replace: true })
    }
    run()
  }, [navigate])

  return <div style={{ padding: 24 }}>Loading dashboard...</div>
}
