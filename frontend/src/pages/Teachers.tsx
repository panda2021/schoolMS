import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'

interface TeacherRow {
  teacher_id: string
  user_id: string
  full_name: string | null
  email: string | null
  active: boolean
}

interface PendingInvite {
  id: string
  email: string
  full_name: string | null
  created_at: string
}

export default function Teachers() {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [pending, setPending] = useState<PendingInvite[]>([])

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)

  const init = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
    setRole(me?.role_key ?? null)
    setSchoolId(me?.school_id ?? null)
    if (me?.role_key !== 'school_admin') { setLoading(false); return }

    await reload(me.school_id!)
    setLoading(false)
  }

  const reload = async (sid: string) => {
    const { data: tch } = await supabase
      .from('teachers')
      .select('id, user_id, deleted_at, users(full_name, email)')
      .eq('school_id', sid)
    setTeachers((tch ?? []).map((t: any) => ({
      teacher_id: t.id,
      user_id: t.user_id,
      full_name: t.users?.full_name ?? null,
      email: t.users?.email ?? null,
      active: !t.deleted_at,
    })))

    const { data: inv } = await supabase
      .from('pending_invitations')
      .select('id, email, full_name, created_at')
      .eq('school_id', sid)
      .eq('role_key', 'teacher')
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
    setPending(inv ?? [])
  }

  useEffect(() => { init() }, [])

  const inviteTeacher = async () => {
    if (!inviteEmail.trim() || !schoolId || !userId) return
    if (!/^\S+@\S+\.\S+$/.test(inviteEmail.trim())) {
      show('Please enter a valid email.', 'error')
      return
    }
    setInviting(true)
    try {
      const { error: invErr } = await supabase.from('pending_invitations').insert({
        email: inviteEmail.trim().toLowerCase(),
        role_key: 'teacher',
        full_name: inviteName.trim() || null,
        school_id: schoolId,
        invited_by: userId,
      })
      if (invErr) throw invErr

      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: inviteEmail.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          shouldCreateUser: true,
        },
      })
      if (otpErr) throw otpErr

      show(`Invitation sent to ${inviteEmail}. They will be set up as a teacher when they log in.`, 'success')
      setInviteEmail(''); setInviteName(''); setShowInvite(false)
      await reload(schoolId)
    } catch (e: any) {
      show(e.message || 'Failed to invite teacher', 'error')
    } finally {
      setInviting(false)
    }
  }

  const cancelInvite = async (id: string) => {
    if (!confirm('Cancel this pending invitation?')) return
    const { error } = await supabase.from('pending_invitations').delete().eq('id', id)
    if (error) show(error.message, 'error')
    else { show('Invitation cancelled', 'success'); if (schoolId) await reload(schoolId) }
  }

  const deactivate = async (teacherId: string, name: string | null) => {
    if (!confirm(`Deactivate teacher ${name || ''}? They will lose access until reactivated.`)) return
    const { error } = await supabase.from('teachers').update({ deleted_at: new Date().toISOString() }).eq('id', teacherId)
    if (error) show(error.message, 'error')
    else { show('Teacher deactivated', 'success'); if (schoolId) await reload(schoolId) }
  }

  const reactivate = async (teacherId: string) => {
    const { error } = await supabase.from('teachers').update({ deleted_at: null }).eq('id', teacherId)
    if (error) show(error.message, 'error')
    else { show('Teacher reactivated', 'success'); if (schoolId) await reload(schoolId) }
  }

  if (loading) return (
    <div className="card">
      <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 60, width: '100%', borderRadius: 8, marginTop: 12 }} />
    </div>
  )

  if (role !== 'school_admin') {
    return <div className="card"><h2 style={{ marginTop: 0 }}>Teachers</h2><p className="helper">Only school administrators can manage teachers.</p></div>
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Teachers</h2>
          {!showInvite && (
            <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Invite teacher</button>
          )}
        </div>

        {showInvite && (
          <div className="card" style={{ background: 'var(--bg)', marginBottom: 16 }}>
            <p className="helper" style={{ margin: '0 0 8px 0' }}>
              Invite a teacher by email. They'll receive a magic-link sign-in.
              On first login they'll be set up as a teacher in your school.
            </p>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <div>
                <label className="helper">Email *</label>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teacher@school.com" type="email" />
              </div>
              <div>
                <label className="helper">Full name (optional)</label>
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Doe" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={inviteTeacher} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <><LoadingSpinner size="sm" /> Sending invite…</> : 'Send invite'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowInvite(false); setInviteEmail(''); setInviteName('') }}>Cancel</button>
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Pending invitations</h4>
            <table>
              <thead><tr><th>Email</th><th>Name</th><th>Invited</th><th></th></tr></thead>
              <tbody>
                {pending.map(p => (
                  <tr key={p.id}>
                    <td>{p.email}</td>
                    <td>{p.full_name ?? '—'}</td>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13, color: '#dc2626' }} onClick={() => cancelInvite(p.id)}>Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h4 style={{ margin: '0 0 8px 0' }}>Active teachers ({teachers.filter(t => t.active).length})</h4>
        {teachers.length === 0 ? (
          <div className="empty">No teachers yet. Click "Invite teacher" to add one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.teacher_id}>
                  <td style={{ fontWeight: 500 }}>{t.full_name ?? '—'}</td>
                  <td>{t.email ?? '—'}</td>
                  <td>
                    {t.active
                      ? <span className="badge badge-success">Active</span>
                      : <span className="badge">Inactive</span>}
                  </td>
                  <td>
                    {t.active ? (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13, color: '#dc2626' }} onClick={() => deactivate(t.teacher_id, t.full_name)}>Deactivate</button>
                    ) : (
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13, color: 'var(--primary)' }} onClick={() => reactivate(t.teacher_id)}>Reactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
