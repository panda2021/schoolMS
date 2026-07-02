import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '@/ui/theme/ThemeProvider'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useFeature } from '@/ui/features/FeatureProvider'
import { useBranding } from '@/ui/branding/BrandingProvider'
import { supabase } from '@/lib/supabaseClient'

const NavLink: React.FC<{ to: string; label: string; icon?: React.ReactNode; onClick?: () => void }> = ({ to, label, icon, onClick }) => {
  const loc = useLocation()
  const active = loc.pathname === to
  return (
    <Link to={to} className="nav-link" aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick} style={{
      textDecoration: 'none',
      color: 'var(--text)',
      padding: '10px 12px',
      borderRadius: 10,
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
      border: active ? '1px solid var(--border)' : '1px solid transparent'
    }}>
      <span aria-hidden>{icon ?? '•'}</span>
      <span>{label}</span>
    </Link>
  )
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggle } = useTheme()
  const { t, language, setLanguage } = useLanguage()
  const { can } = useFeature()
  const { logoUrl } = useBranding()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    const loadRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('users').select('role_key').eq('id', user.id).maybeSingle()
      setUserRole(data?.role_key ?? null)
    }
    loadRole()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const closeMobile = () => setMobileOpen(false)

  const isSuperAdmin = userRole === 'super_admin'

  // Non-super navigation is gated by capability (from useFeature), not hardcoded
  // role checks. Seeded role defaults reproduce today's visibility exactly; edits
  // to the feature matrix or per-user overrides now flow through to the nav.
  const navItems = isSuperAdmin ? (
    <>
      <NavLink to="/app/super" label={t('nav.overview')} onClick={closeMobile} />
      <NavLink to="/app/features" label={t('nav.featureMatrix') || 'Feature matrix'} onClick={closeMobile} />
      <NavLink to="/app/helpdesk" label={t('nav.helpdesk')} onClick={closeMobile} />
      <NavLink to="/app/search" label={t('nav.search')} onClick={closeMobile} />
      <NavLink to="/app/settings" label={t('nav.settings')} onClick={closeMobile} />
    </>
  ) : (
    <>
      <NavLink to="/app" label={t('nav.dashboard')} onClick={closeMobile} />
      {can('classes.view') && (
        <NavLink to="/app/classes" label={t('nav.classes')} onClick={closeMobile} />
      )}
      {can('students.view') && (
        <NavLink to="/app/students" label={t('nav.students')} onClick={closeMobile} />
      )}
      {can('attendance.view') && (
        <NavLink to="/app/attendance" label={t('nav.attendance')} onClick={closeMobile} />
      )}
      {can('updates.view') && (
        <NavLink to="/app/updates" label={t('nav.updates')} onClick={closeMobile} />
      )}
      {can('announcements.view') && (
        <NavLink to="/app/announcements" label={t('nav.announcements')} onClick={closeMobile} />
      )}
      {can('messages.view') && (
        <NavLink to="/app/messages" label={t('nav.messages')} onClick={closeMobile} />
      )}
      {can('reports.view') && (
        <NavLink to="/app/reports" label={t('nav.reports')} onClick={closeMobile} />
      )}
      {can('grades.view') && (
        <NavLink to="/app/grades" label={t('nav.grades')} onClick={closeMobile} />
      )}
      {can('report_cards.view') && (
        <NavLink to="/app/report-cards" label={t('nav.reportCards')} onClick={closeMobile} />
      )}
      {can('teachers.view') && (
        <NavLink to="/app/teachers" label={t('nav.teachers') || 'Teachers'} onClick={closeMobile} />
      )}
      {can('parents.view') && (
        <NavLink to="/app/parents" label={t('nav.parents') || 'Parents'} onClick={closeMobile} />
      )}
      {can('import.use') && (
        <NavLink to="/app/import" label={t('nav.import')} onClick={closeMobile} />
      )}
      {can('helpdesk.use') && (
        <NavLink to="/app/helpdesk" label={t('nav.helpdesk') || 'Helpdesk'} onClick={closeMobile} />
      )}
      <NavLink to="/app/settings" label={t('nav.settings')} onClick={closeMobile} />
    </>
  )

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="sidebar sidebar-desktop">
        <div className="brand">
          <img src={logoUrl || "/images/logo.webp"} alt="School logo" style={{ width: 120, height: 'auto', borderRadius: 12, display: 'block', maxHeight: 48, objectFit: 'contain' }} />
          {isSuperAdmin && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('nav.platformAdmin')}</div>}
        </div>
        <nav className="nav-vertical">{navItems}</nav>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={closeMobile}>
          <aside className="mobile-sidebar" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <img src={logoUrl || "/images/logo.webp"} alt="School logo" style={{ width: 100, height: 'auto', borderRadius: 10, maxHeight: 44, objectFit: 'contain' }} />
              <button className="btn btn-ghost" onClick={closeMobile} aria-label="Close menu" style={{ fontSize: 20, padding: '4px 8px' }}>&times;</button>
            </div>
            <nav className="nav-vertical">{navItems}</nav>
          </aside>
        </div>
      )}

      <main id="main" className="content" tabIndex={-1}>
        <div className="topbar">
          <button className="btn btn-secondary mobile-hamburger" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu">
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ display: 'block', width: 18, height: 2, background: 'var(--text)', borderRadius: 2 }} />
              <span style={{ display: 'block', width: 18, height: 2, background: 'var(--text)', borderRadius: 2 }} />
              <span style={{ display: 'block', width: 18, height: 2, background: 'var(--text)', borderRadius: 2 }} />
            </span>
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setLanguage(language === 'en' ? 'am' : 'en')}
              aria-label="Switch language"
              style={{ fontWeight: 600, minWidth: 40 }}
            >
              {language === 'en' ? 'AM' : 'EN'}
            </button>
            <button className="btn btn-secondary" onClick={toggle} aria-label={theme === 'light' ? t('nav.darkMode') : t('nav.lightMode')}>
              {theme === 'light' ? t('nav.darkMode') : t('nav.lightMode')}
            </button>
            <button className="btn btn-secondary" onClick={signOut} aria-label={t('nav.signOut')}>{t('nav.signOut')}</button>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
