import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Hourglass } from 'lucide-react'

/**
 * Shown to authenticated users whose profile is role='pending' — they signed
 * in without a matching invitation (D2). The super admin approves or rejects
 * them from the dashboard; on approval their next login routes normally.
 */
export default function PendingApproval() {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: '48px auto', textAlign: 'center', padding: 32 }}>
      <Hourglass size={40} style={{ color: 'var(--accent)', marginBottom: 12 }} />
      <h2 style={{ marginTop: 0 }}>{t('pendingApproval.title')}</h2>
      <p className="helper" style={{ fontSize: 14, lineHeight: 1.6 }}>
        {t('pendingApproval.body')}
      </p>
      <button className="btn btn-secondary" onClick={signOut} style={{ marginTop: 16 }}>
        {t('nav.signOut')}
      </button>
    </div>
  )
}
