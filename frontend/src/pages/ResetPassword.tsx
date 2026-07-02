import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Lock, ArrowRight } from 'lucide-react'

/**
 * Landing page for Supabase password-recovery links
 * (Login "Forgot password?" -> resetPasswordForEmail -> email -> here).
 * The recovery link signs the user in with a temporary session; we let them
 * set a new password, then continue into the app.
 */
export default function ResetPassword() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  useEffect(() => {
    // The recovery token in the URL hash is consumed by supabase-js on load.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasSession(!!session)
        setReady(true)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (password.length < 6) {
      setMessage({ text: t('reset.tooShort'), type: 'error' })
      return
    }
    if (password !== confirm) {
      setMessage({ text: t('reset.mismatch'), type: 'error' })
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setMessage({ text: error.message, type: 'error' })
      setLoading(false)
    } else {
      setMessage({ text: t('reset.success'), type: 'success' })
      setTimeout(() => navigate('/app', { replace: true }), 1200)
    }
  }

  return (
    <div className="login-page">
      <div className="login-form-panel" style={{ width: '100%' }}>
        <div className="login-form-container">
          <div className="login-form-header">
            <h2>{t('reset.title')}</h2>
            <p>{t('reset.subtitle')}</p>
          </div>

          {!ready ? (
            <div className="login-footer-text">…</div>
          ) : !hasSession ? (
            <>
              <div className="login-message error">{t('reset.noSession')}</div>
              <div className="login-footer-text">
                <Link to="/login">{t('reset.backToLogin')}</Link>
              </div>
            </>
          ) : (
            <form className="login-form" onSubmit={submit}>
              <div className="login-field">
                <label htmlFor="new-password">{t('reset.newPassword')}</label>
                <div className="login-input-wrap">
                  <Lock size={16} className="login-input-icon" />
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <div className="login-field">
                <label htmlFor="confirm-password">{t('reset.confirmPassword')}</label>
                <div className="login-input-wrap">
                  <Lock size={16} className="login-input-icon" />
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? <span className="login-spinner" /> : <>{t('reset.submit')} <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {message && (
            <div className={`login-message ${message.type}`}>{message.text}</div>
          )}
        </div>
      </div>
    </div>
  )
}
