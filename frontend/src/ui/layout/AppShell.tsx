import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '@/ui/theme/ThemeProvider'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useFeature } from '@/ui/features/FeatureProvider'
import { useBranding } from '@/ui/branding/BrandingProvider'
import { supabase } from '@/lib/supabaseClient'
import {
  LayoutDashboard, BookOpen, Users, CalendarCheck, Newspaper, Megaphone,
  MessageSquare, ClipboardList, GraduationCap, FileText, UserCog, HeartHandshake,
  Upload, LifeBuoy, Settings, Search, Grid3X3, Building2,
} from 'lucide-react'

const NavLink: React.FC<{ to: string; label: string; icon?: React.ReactNode; onClick?: () => void }> = ({ to, label, icon, onClick }) => {
  const loc = useLocation()
  const active = loc.pathname === to
  return (
    <Link
      to={to}
      className={`nav-link${active ? ' active' : ''}`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span aria-hidden style={{ display: 'inline-flex' }}>{icon ?? null}</span>
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
  const iconSize = 16
  const navItems = isSuperAdmin ? (
    <>
      <NavLink to="/app/super" label={t('nav.overview')} icon={<Building2 size={iconSize} />} onClick={closeMobile} />
      <NavLink to="/app/features" label={t('nav.featureMatrix') || 'Feature matrix'} icon={<Grid3X3 size={iconSize} />} onClick={closeMobile} />
      <NavLink to="/app/helpdesk" label={t('nav.helpdesk')} icon={<LifeBuoy size={iconSize} />} onClick={closeMobile} />
      <NavLink to="/app/search" label={t('nav.search')} icon={<Search size={iconSize} />} onClick={closeMobile} />
      <NavLink to="/app/settings" label={t('nav.settings')} icon={<Settings size={iconSize} />} onClick={closeMobile} />
    </>
  ) : (
    <>
      <NavLink to="/app" label={t('nav.dashboard')} icon={<LayoutDashboard size={iconSize} />} onClick={closeMobile} />
      {can('classes.view') && (
        <NavLink to="/app/classes" label={t('nav.classes')} icon={<BookOpen size={iconSize} />} onClick={closeMobile} />
      )}
      {can('students.view') && (
        <NavLink to="/app/students" label={t('nav.students')} icon={<Users size={iconSize} />} onClick={closeMobile} />
      )}
      {can(['attendance.view', 'children.attendance.view']) && (
        <NavLink to="/app/attendance" label={t('nav.attendance')} icon={<CalendarCheck size={iconSize} />} onClick={closeMobile} />
      )}
      {can('updates.view') && (
        <NavLink to="/app/updates" label={t('nav.updates')} icon={<Newspaper size={iconSize} />} onClick={closeMobile} />
      )}
      {can('announcements.view') && (
        <NavLink to="/app/announcements" label={t('nav.announcements')} icon={<Megaphone size={iconSize} />} onClick={closeMobile} />
      )}
      {can('messages.view') && (
        <NavLink to="/app/messages" label={t('nav.messages')} icon={<MessageSquare size={iconSize} />} onClick={closeMobile} />
      )}
      {can('reports.view') && (
        <NavLink to="/app/reports" label={t('nav.reports')} icon={<ClipboardList size={iconSize} />} onClick={closeMobile} />
      )}
      {can('grades.view') && (
        <NavLink to="/app/grades" label={t('nav.grades')} icon={<GraduationCap size={iconSize} />} onClick={closeMobile} />
      )}
      {can('report_cards.view') && (
        <NavLink to="/app/report-cards" label={t('nav.reportCards')} icon={<FileText size={iconSize} />} onClick={closeMobile} />
      )}
      {can('teachers.view') && (
        <NavLink to="/app/teachers" label={t('nav.teachers') || 'Teachers'} icon={<UserCog size={iconSize} />} onClick={closeMobile} />
      )}
      {can('parents.view') && (
        <NavLink to="/app/parents" label={t('nav.parents') || 'Parents'} icon={<HeartHandshake size={iconSize} />} onClick={closeMobile} />
      )}
      {can('import.use') && (
        <NavLink to="/app/import" label={t('nav.import')} icon={<Upload size={iconSize} />} onClick={closeMobile} />
      )}
      {can('helpdesk.use') && (
        <NavLink to="/app/helpdesk" label={t('nav.helpdesk') || 'Helpdesk'} icon={<LifeBuoy size={iconSize} />} onClick={closeMobile} />
      )}
      <NavLink to="/app/settings" label={t('nav.settings')} icon={<Settings size={iconSize} />} onClick={closeMobile} />
    </>
  )

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="sidebar sidebar-desktop">
        <div className="brand">
          <span className="brand-plate">
            <img src={logoUrl || "/images/logo.webp"} alt="School logo" style={{ width: 108, height: 'auto', display: 'block', maxHeight: 40, objectFit: 'contain' }} />
          </span>
          {isSuperAdmin && (
            <div className="sidebar-eyebrow" style={{ padding: 0, marginTop: 2 }}>{t('nav.platformAdmin')}</div>
          )}
        </div>
        <nav className="nav-vertical" style={{ flex: 1 }}>{navItems}</nav>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={closeMobile}>
          <aside className="mobile-sidebar" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span className="brand-plate">
                <img src={logoUrl || "/images/logo.webp"} alt="School logo" style={{ width: 90, height: 'auto', maxHeight: 36, objectFit: 'contain' }} />
              </span>
              <button
                onClick={closeMobile}
                aria-label="Close menu"
                style={{ fontSize: 22, padding: '4px 10px', background: 'transparent', border: 'none', color: 'var(--sidebar-text)', cursor: 'pointer' }}
              >
                &times;
              </button>
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
