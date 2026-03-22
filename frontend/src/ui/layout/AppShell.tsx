import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '@/ui/theme/ThemeProvider'
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
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const closeMobile = () => setMobileOpen(false)

  const navItems = (
    <>
      <NavLink to="/app" label="Dashboard" onClick={closeMobile} />
      <NavLink to="/app/classes" label="Classes" onClick={closeMobile} />
      <NavLink to="/app/students" label="Students" onClick={closeMobile} />
      <NavLink to="/app/attendance" label="Attendance" onClick={closeMobile} />
      <NavLink to="/app/updates" label="Daily Updates" onClick={closeMobile} />
      <NavLink to="/app/announcements" label="Announcements" onClick={closeMobile} />
      <NavLink to="/app/messages" label="Messages" onClick={closeMobile} />
      <NavLink to="/app/reports" label="Progress Reports" onClick={closeMobile} />
      <NavLink to="/app/import" label="Bulk Import" onClick={closeMobile} />
      <NavLink to="/app/settings" label="Settings" onClick={closeMobile} />
    </>
  )

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="sidebar sidebar-desktop">
        <div className="brand">
          <img src="/images/logo.webp" alt="Abogida logo" style={{ width: 120, height: 'auto', borderRadius: 12, display: 'block', aspectRatio: '500 / 178', maxHeight: 42.72 }} />
        </div>
        <nav className="nav-vertical">{navItems}</nav>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={closeMobile}>
          <aside className="mobile-sidebar" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <img src="/images/logo.webp" alt="Abogida logo" style={{ width: 100, height: 'auto', borderRadius: 10 }} />
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
            <button className="btn btn-secondary" onClick={toggle} aria-label={theme === 'light' ? 'Activate dark mode' : 'Activate light mode'}>
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
            <button className="btn btn-secondary" onClick={signOut} aria-label="Sign out of Abogida">Sign out</button>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
