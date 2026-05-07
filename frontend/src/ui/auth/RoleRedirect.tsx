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

      // If no public.users row, provision one (default role: parent)
      if (!data?.role_key) {
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
      else navigate('/app/parent', { replace: true })
    }
    run()
  }, [navigate])

  return <div style={{ padding: 24 }}>Loading dashboard...</div>
}
