import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Per-school branding, applied AFTER login (D5). Loads the signed-in user's
// school colors/logo/background and applies them: colors override the CSS design
// tokens on :root (inline, so they win over the light/dark theme stylesheet), and
// the background image renders as a faint fixed layer behind the content.

export type Branding = {
  primaryColor: string | null
  secondaryColor: string | null
  logoUrl: string | null
  bgImageUrl: string | null
  bgOpacity: number
}

const DEFAULT: Branding = {
  primaryColor: null,
  secondaryColor: null,
  logoUrl: null,
  bgImageUrl: null,
  bgOpacity: 0.08,
}

type BrandingContextValue = Branding & { refresh: () => Promise<void> }

const BrandingContext = createContext<BrandingContextValue>({ ...DEFAULT, refresh: async () => {} })

// Darken a #rrggbb hex by pct (0..1) — used to derive the --primary-600 hover shade.
function darken(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - pct)))
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - pct)))
  const b = Math.max(0, Math.round((n & 255) * (1 - pct)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<Branding>(DEFAULT)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBranding(DEFAULT); return }
    const { data: me } = await supabase.from('users').select('school_id').eq('id', user.id).maybeSingle()
    if (!me?.school_id) { setBranding(DEFAULT); return }
    const { data: s } = await supabase
      .from('schools')
      .select('primary_color, secondary_color, logo_url, bg_image_url, bg_opacity')
      .eq('id', me.school_id)
      .maybeSingle()
    if (!s) { setBranding(DEFAULT); return }
    setBranding({
      primaryColor: s.primary_color ?? null,
      secondaryColor: s.secondary_color ?? null,
      logoUrl: s.logo_url ?? null,
      bgImageUrl: s.bg_image_url ?? null,
      bgOpacity: s.bg_opacity == null ? DEFAULT.bgOpacity : Number(s.bg_opacity),
    })
  }, [])

  useEffect(() => {
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => { load() })
    return () => { sub.subscription.unsubscribe() }
  }, [load])

  // Apply the color tokens inline on :root so they override the theme stylesheet.
  useEffect(() => {
    const root = document.documentElement
    if (branding.primaryColor) {
      root.style.setProperty('--primary', branding.primaryColor)
      root.style.setProperty('--primary-600', darken(branding.primaryColor, 0.12))
    } else {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--primary-600')
    }
    if (branding.secondaryColor) {
      root.style.setProperty('--accent', branding.secondaryColor)
    } else {
      root.style.removeProperty('--accent')
    }
    return () => {
      // Clear on unmount so branding never leaks across sessions.
      root.style.removeProperty('--primary')
      root.style.removeProperty('--primary-600')
      root.style.removeProperty('--accent')
    }
  }, [branding.primaryColor, branding.secondaryColor])

  return (
    <BrandingContext.Provider value={{ ...branding, refresh: load }}>
      {branding.bgImageUrl && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: -1,
            backgroundImage: `url("${branding.bgImageUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: branding.bgOpacity,
            pointerEvents: 'none',
          }}
        />
      )}
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
