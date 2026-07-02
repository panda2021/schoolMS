import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Modal } from '@/ui/components/Modal'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { useToast } from '@/ui/components/toast/ToastProvider'

interface FeatureRow {
  key: string
  feature: string
  label: string
  sort_order: number
}

/**
 * Per-user additive permission editor (D3: add-only, D4: homeroom bumps).
 *
 * Shows the whole capability catalog grouped by feature. Capabilities the
 * target user already has from their ROLE are checked and locked ("role").
 * Everything else can be granted / revoked as a user_feature_override row.
 * RLS (0027) restricts writes to same-school school_admins and super_admin.
 */
export function UserOverridesModal({
  userId,
  userName,
  roleKey,
  onClose,
}: {
  userId: string
  userName: string
  roleKey: string
  onClose: () => void
}) {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<FeatureRow[]>([])
  const [roleDefaults, setRoleDefaults] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<Set<string>>(new Set())
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: feats }, { data: roleFeats }, { data: userOverrides }] = await Promise.all([
        supabase.from('features').select('key, feature, label, sort_order').order('sort_order'),
        supabase.from('role_features').select('feature_key').eq('role_key', roleKey),
        supabase.from('user_feature_overrides').select('feature_key').eq('user_id', userId),
      ])
      setCatalog(feats ?? [])
      setRoleDefaults(new Set((roleFeats ?? []).map(r => r.feature_key)))
      setOverrides(new Set((userOverrides ?? []).map(o => o.feature_key)))
      setLoading(false)
    }
    load()
  }, [userId, roleKey])

  const groups = useMemo(() => {
    const map = new Map<string, FeatureRow[]>()
    for (const f of catalog) {
      if (!map.has(f.feature)) map.set(f.feature, [])
      map.get(f.feature)!.push(f)
    }
    return Array.from(map.entries())
  }, [catalog])

  const toggle = async (key: string) => {
    setBusyKey(key)
    if (overrides.has(key)) {
      const { error } = await supabase.from('user_feature_overrides')
        .delete().eq('user_id', userId).eq('feature_key', key)
      if (error) show(error.message, 'error')
      else setOverrides(prev => { const n = new Set(prev); n.delete(key); return n })
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('user_feature_overrides')
        .insert({ user_id: userId, feature_key: key, granted_by: user?.id ?? null })
      if (error) show(error.message, 'error')
      else setOverrides(prev => new Set(prev).add(key))
    }
    setBusyKey(null)
  }

  return (
    <Modal open onClose={onClose} title={`Extra permissions — ${userName}`} wide>
      <p className="helper" style={{ margin: '0 0 14px', lineHeight: 1.6 }}>
        Checked-and-locked items come with the <strong>{roleKey.replace('_', ' ')}</strong> role
        and cannot be removed here (permissions only add, never subtract). Extra grants take
        effect the next time this person signs in or reloads the app.
      </p>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}><LoadingSpinner size="md" /></div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {groups.map(([feature, rows]) => (
            <div key={feature}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.12em',
                textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6,
              }}>
                {feature.replace('_', ' ')}
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {rows.map(f => {
                  const fromRole = roleDefaults.has(f.key)
                  const granted = overrides.has(f.key)
                  return (
                    <label
                      key={f.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '6px 8px', borderRadius: 8,
                        cursor: fromRole ? 'default' : 'pointer',
                        opacity: busyKey === f.key ? 0.5 : 1,
                        background: granted ? 'color-mix(in srgb, var(--primary) 7%, transparent)' : 'transparent',
                        margin: 0, fontSize: 14, color: 'var(--text)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={fromRole || granted}
                        disabled={fromRole || busyKey === f.key}
                        onChange={() => toggle(f.key)}
                        style={{ width: 16, height: 16 }}
                      />
                      <span style={{ flex: 1 }}>{f.label}</span>
                      {fromRole && <span className="badge" style={{ fontSize: 10 }}>role</span>}
                      {granted && !fromRole && <span className="badge badge-info" style={{ fontSize: 10 }}>extra</span>}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}
