import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'

// Super-admin editor for the ROLE DEFAULT matrix (public.role_features).
// Rows = capabilities (public.features), columns = editable roles. super_admin is
// implicitly all-capable and is shown locked. Per-user additive overrides (D3)
// are managed elsewhere (Phase 5); this screen only edits the platform defaults.

interface FeatureRow {
  key: string
  feature: string
  action: string
  label: string
  sort_order: number
}

// Roles whose defaults are editable here. super_admin is intentionally excluded.
const EDITABLE_ROLES: { key: string; label: string }[] = [
  { key: 'school_admin', label: 'School admin' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'parent', label: 'Parent' },
]

const cellKey = (role: string, feature: string) => `${role}|${feature}`

export default function FeatureMatrix() {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [features, setFeatures] = useState<FeatureRow[]>([])
  const [granted, setGranted] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Set<string>>(new Set())

  useEffect(() => { init() }, [])

  const init = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: me } = await supabase.from('users').select('role_key').eq('id', user.id).maybeSingle()
    setRole(me?.role_key ?? null)
    if (me?.role_key !== 'super_admin') { setLoading(false); return }

    const [{ data: feats }, { data: rf }] = await Promise.all([
      supabase.from('features').select('key, feature, action, label, sort_order').order('sort_order'),
      supabase.from('role_features').select('role_key, feature_key'),
    ])
    setFeatures((feats ?? []) as FeatureRow[])
    setGranted(new Set((rf ?? []).map(r => cellKey(r.role_key, r.feature_key))))
    setLoading(false)
  }

  // Group capabilities by their feature for a readable, sectioned table.
  const groups = useMemo(() => {
    const map = new Map<string, FeatureRow[]>()
    for (const f of features) {
      const arr = map.get(f.feature) ?? []
      arr.push(f)
      map.set(f.feature, arr)
    }
    return Array.from(map.entries())
  }, [features])

  const toggle = async (roleKey: string, featureKey: string) => {
    const ck = cellKey(roleKey, featureKey)
    if (saving.has(ck)) return
    const currentlyGranted = granted.has(ck)

    // Optimistic update.
    setSaving(prev => new Set(prev).add(ck))
    setGranted(prev => {
      const next = new Set(prev)
      if (currentlyGranted) next.delete(ck); else next.add(ck)
      return next
    })

    const { error } = currentlyGranted
      ? await supabase.from('role_features').delete().eq('role_key', roleKey).eq('feature_key', featureKey)
      : await supabase.from('role_features').insert({ role_key: roleKey, feature_key: featureKey })

    if (error) {
      // Revert on failure.
      setGranted(prev => {
        const next = new Set(prev)
        if (currentlyGranted) next.add(ck); else next.delete(ck)
        return next
      })
      show(error.message, 'error')
    }
    setSaving(prev => { const next = new Set(prev); next.delete(ck); return next })
  }

  if (loading) return <div className="card"><LoadingSpinner /></div>
  if (role !== 'super_admin') {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Feature matrix</h2>
        <p className="helper">Only the platform super-admin can edit role defaults.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Feature matrix</h2>
      <p className="helper" style={{ marginTop: 0 }}>
        Default capabilities per role, applied across all schools. Changes take effect the next time a
        user loads the app. <strong>Super admin</strong> always has every capability. Admins can grant
        extra capabilities to individual users (never remove) from a user's profile.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', minWidth: 200 }}>Capability</th>
              {EDITABLE_ROLES.map(r => (
                <th key={r.key} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{r.label}</th>
              ))}
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--muted)' }}>Super admin</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, rows]) => (
              <Fragment key={group}>
                <tr>
                  <td colSpan={EDITABLE_ROLES.length + 2} style={{ fontWeight: 700, textTransform: 'capitalize', background: 'var(--bg)' }}>
                    {group.replace(/_/g, ' ')}
                  </td>
                </tr>
                {rows.map(f => (
                  <tr key={f.key}>
                    <td>{f.label} <span className="helper" style={{ fontSize: 12 }}>({f.action})</span></td>
                    {EDITABLE_ROLES.map(r => {
                      const ck = cellKey(r.key, f.key)
                      return (
                        <td key={ck} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={granted.has(ck)}
                            disabled={saving.has(ck)}
                            onChange={() => toggle(r.key, f.key)}
                            aria-label={`${r.label} — ${f.label}`}
                          />
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked disabled aria-label={`Super admin — ${f.label}`} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
