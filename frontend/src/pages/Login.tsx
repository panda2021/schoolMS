import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { ArrowRight, Mail, Lock, Sparkles } from 'lucide-react'

export default function Login() {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const navigate = useNavigate()
  const location = useLocation() as any

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage({ text: error.message, type: 'error' })
    if (data?.session) {
      const redirectTo = location.state?.from?.pathname || '/app'
      navigate(redirectTo, { replace: true })
    }
    setLoading(false)
  }

  const forgotPassword = async () => {
    if (!email.trim()) {
      setMessage({ text: t('login.enterEmailFirst'), type: 'error' })
      return
    }
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setMessage({ text: error.message, type: 'error' })
    else setMessage({ text: t('login.resetEmailSent'), type: 'success' })
    setLoading(false)
  }

  const magicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app` }
    })
    if (error) setMessage({ text: error.message, type: 'error' })
    else setMessage({ text: t('login.checkEmail'), type: 'success' })
    setLoading(false)
  }

  return (
    <div className="login-page">
      {/* Left visual panel */}
      <div className="login-visual">
        <div className="login-visual-content">
          <img src="/images/logo.webp" alt="Abogida" style={{ width: 120, borderRadius: 12, marginBottom: 32 }} />
          <h1>{t('login.welcome')}</h1>
          <p>{t('login.subtitle')}</p>
          <div className="login-features">
            {[
              t('login.feature1'),
              t('login.feature2'),
              t('login.feature3'),
              t('login.feature4'),
            ].map((f, i) => (
              <div key={i} className="login-feature-item">
                <div className="login-feature-dot" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="login-visual-footer">
          <Link to="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 14 }}>
            &larr; {t('login.backHome')}
          </Link>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel">
        <div className="login-form-container">
          <div className="login-form-header">
            <h2>{t('login.signIn')}</h2>
            <p>{t('login.signInDesc')}</p>
          </div>

          {/* Mode tabs */}
          <div className="login-tabs">
            <button
              className={`login-tab ${mode === 'password' ? 'active' : ''}`}
              onClick={() => setMode('password')}
            >
              <Lock size={14} /> {t('login.password')}
            </button>
            <button
              className={`login-tab ${mode === 'magic' ? 'active' : ''}`}
              onClick={() => setMode('magic')}
            >
              <Sparkles size={14} /> {t('login.magicLink')}
            </button>
          </div>

          <form className="login-form" onSubmit={mode === 'password' ? signIn : magicLink}>
            <div className="login-field">
              <label htmlFor="email">{t('login.email')}</label>
              <div className="login-input-wrap">
                <Mail size={16} className="login-input-icon" />
                <input
                  id="email"
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {mode === 'password' && (
              <div className="login-field">
                <label htmlFor="password">{t('login.password')}</label>
                <div className="login-input-wrap">
                  <Lock size={16} className="login-input-icon" />
                  <input
                    id="password"
                    type="password"
                    placeholder={t('login.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </div>
            )}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? (
                <span className="login-spinner" />
              ) : (
                <>
                  {mode === 'password' ? t('login.signInBtn') : t('login.sendMagicLink')}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {message && (
            <div className={`login-message ${message.type}`}>
              {message.text}
            </div>
          )}

          <div className="login-footer-text">
            {mode === 'password' ? (
              <>
                {t('login.forgotPassword')}{' '}
                <button
                  type="button"
                  onClick={forgotPassword}
                  disabled={loading}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: 'var(--primary)', font: 'inherit', textDecoration: 'underline',
                  }}
                >
                  {t('login.sendResetLink')}
                </button>
              </>
            ) : (
              t('login.magicLinkHint')
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
