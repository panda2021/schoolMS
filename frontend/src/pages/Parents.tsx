import { Fragment, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'

interface StudentLite {
  id: string
  first_name: string
  last_name: string
}

interface LinkedChild {
  student_id: string
  relation: string | null
  first_name: string
  last_name: string
}

interface ParentRow {
  parent_id: string
  user_id: string
  full_name: string | null
  email: string | null
  children: LinkedChild[]
}

interface PendingInvite {
  id: string
  email: string
  full_name: string | null
  created_at: string
  student_ids: string[] | null
}

const RELATIONS = ['mother', 'father', 'guardian', 'other'] as const

export default function Parents() {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [parents, setParents] = useState<ParentRow[]>([])
  const [students, setStudents] = useState<StudentLite[]>([])
  const [pending, setPending] = useState<PendingInvite[]>([])

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRelation, setInviteRelation] = useState<string>('guardian')
  const [inviteStudentIds, setInviteStudentIds] = useState<string[]>([])
  const [inviteStudentQuery, setInviteStudentQuery] = useState('')
  const [inviting, setInviting] = useState(false)

  // Per-parent expanded management
  const [expanded, setExpanded] = useState<string | null>(null) // parent_id
  const [linkStudentId, setLinkStudentId] = useState('')
  const [linkRelation, setLinkRelation] = useState<string>('guardian')
  const [resetValue, setResetValue] = useState('')
  const [busy, setBusy] = useState(false)

  const init = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
    setRole(me?.role_key ?? null)
    setSchoolId(me?.school_id ?? null)
    if (me?.role_key !== 'school_admin' || !me.school_id) { setLoading(false); return }

    await reload(me.school_id)
    setLoading(false)
  }

  const reload = async (sid: string) => {
    const [{ data: par }, { data: studs }, { data: inv }] = await Promise.all([
      supabase
        .from('parents')
        .select('id, user_id, users(full_name, email), parent_students(student_id, relation, students(id, first_name, last_name))')
        .eq('school_id', sid)
        .is('deleted_at', null),
      supabase
        .from('students')
        .select('id, first_name, last_name')
        .eq('school_id', sid)
        .is('deleted_at', null)
        .order('first_name'),
      supabase
        .from('pending_invitations')
        .select('id, email, full_name, created_at, student_ids')
        .eq('school_id', sid)
        .eq('role_key', 'parent')
        .is('consumed_at', null)
        .order('created_at', { ascending: false }),
    ])

    setParents((par ?? []).map((p: any) => ({
      parent_id: p.id,
      user_id: p.user_id,
      full_name: p.users?.full_name ?? null,
      email: p.users?.email ?? null,
      children: (p.parent_students ?? [])
        .filter((ps: any) => ps.students)
        .map((ps: any) => ({
          student_id: ps.student_id,
          relation: ps.relation,
          first_name: ps.students.first_name,
          last_name: ps.students.last_name,
        })),
    })))
    setStudents(studs ?? [])
    setPending(inv ?? [])
  }

  useEffect(() => { init() }, [])

  const inviteParent = async () => {
    if (!inviteEmail.trim() || !schoolId || !userId) return
    if (!/^\S+@\S+\.\S+$/.test(inviteEmail.trim())) {
      show('Please enter a valid email.', 'error')
      return
    }
    setInviting(true)
    try {
      const { error: invErr } = await supabase.from('pending_invitations').insert({
        email: inviteEmail.trim().toLowerCase(),
        role_key: 'parent',
        full_name: inviteName.trim() || null,
        school_id: schoolId,
        invited_by: userId,
        student_ids: inviteStudentIds.length > 0 ? inviteStudentIds : null,
        relation: inviteRelation,
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

      show(`Invitation sent to ${inviteEmail}. Their children will be linked automatically on first login.`, 'success')
      setInviteEmail(''); setInviteName(''); setInviteStudentIds([]); setInviteStudentQuery(''); setShowInvite(false)
      await reload(schoolId)
    } catch (e: any) {
      show(e.message || 'Failed to invite parent', 'error')
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

  const linkStudent = async (parentId: string) => {
    if (!linkStudentId || !schoolId) return
    setBusy(true)
    const { error } = await supabase.from('parent_students').insert({
      parent_id: parentId,
      student_id: linkStudentId,
      relation: linkRelation,
    })
    if (error) show(error.message, 'error')
    else { show('Student linked', 'success'); setLinkStudentId(''); await reload(schoolId) }
    setBusy(false)
  }

  const unlinkStudent = async (parentId: string, studentId: string, name: string) => {
    if (!confirm(`Unlink ${name} from this parent? The parent will no longer see this child's records.`)) return
    if (!schoolId) return
    setBusy(true)
    const { error } = await supabase.from('parent_students').delete()
      .eq('parent_id', parentId).eq('student_id', studentId)
    if (error) show(error.message, 'error')
    else { show('Student unlinked', 'success'); await reload(schoolId) }
    setBusy(false)
  }

  const resetParentPassword = async (targetUserId: string) => {
    if (resetValue.length < 6) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_reset_password', {
      target_user_id: targetUserId,
      new_password: resetValue,
    })
    if (error) show(error.message, 'error')
    else { show('Password updated. Share it with the parent securely.', 'success'); setResetValue('') }
    setBusy(false)
  }

  const toggleInviteStudent = (id: string) => {
    setInviteStudentIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  const studentName = (s: StudentLite) => `${s.first_name} ${s.last_name}`
  const filteredStudents = students.filter(s =>
    studentName(s).toLowerCase().includes(inviteStudentQuery.toLowerCase()))

  if (loading) return (
    <div className="card">
      <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 60, width: '100%', borderRadius: 8, marginTop: 12 }} />
    </div>
  )

  if (role !== 'school_admin') {
    return <div className="card"><h2 style={{ marginTop: 0 }}>Parents</h2><p className="helper">Only school administrators can manage parents.</p></div>
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Parents</h2>
          {!showInvite && (
            <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Invite parent</button>
          )}
        </div>

        {showInvite && (
          <div className="card" style={{ background: 'var(--bg)', marginBottom: 16 }}>
            <p className="helper" style={{ margin: '0 0 8px 0' }}>
              Invite a parent by email and pick their child(ren) now — the link is
              created automatically the first time they sign in.
            </p>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <div>
                <label className="helper">Email *</label>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="parent@example.com" type="email" />
              </div>
              <div>
                <label className="helper">Full name (optional)</label>
                <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Doe" />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label className="helper">Relationship to student(s)</label>
              <select value={inviteRelation} onChange={e => setInviteRelation(e.target.value)} style={{ maxWidth: 220 }}>
                {RELATIONS.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 10 }}>
              <label className="helper">Link to student(s) — {inviteStudentIds.length} selected</label>
              <input
                value={inviteStudentQuery}
                onChange={e => setInviteStudentQuery(e.target.value)}
                placeholder="Search students…"
                style={{ marginBottom: 6 }}
              />
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {filteredStudents.length === 0 ? (
                  <div className="helper">No students match.</div>
                ) : filteredStudents.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={inviteStudentIds.includes(s.id)}
                      onChange={() => toggleInviteStudent(s.id)}
                    />
                    <span>{studentName(s)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={inviteParent} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <><LoadingSpinner size="sm" /> Sending invite…</> : 'Send invite'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowInvite(false); setInviteEmail(''); setInviteName(''); setInviteStudentIds([]) }}>Cancel</button>
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Pending invitations</h4>
            <table>
              <thead><tr><th>Email</th><th>Name</th><th>Students</th><th>Invited</th><th></th></tr></thead>
              <tbody>
                {pending.map(p => (
                  <tr key={p.id}>
                    <td>{p.email}</td>
                    <td>{p.full_name ?? '—'}</td>
                    <td>{p.student_ids?.length ?? 0}</td>
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

        <h4 style={{ margin: '0 0 8px 0' }}>Parents ({parents.length})</h4>
        {parents.length === 0 ? (
          <div className="empty">No parents yet. Click "Invite parent" to add one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Children</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parents.map(p => (
                <Fragment key={p.parent_id}>
                  <tr>
                    <td style={{ fontWeight: 500 }}>{p.full_name || '—'}</td>
                    <td>{p.email ?? '—'}</td>
                    <td>
                      {p.children.length === 0
                        ? <span className="badge badge-warning">No children linked</span>
                        : p.children.map(c => (
                            <span key={c.student_id} className="badge" style={{ marginRight: 4 }}>
                              {c.first_name} {c.last_name}{c.relation ? ` (${c.relation})` : ''}
                            </span>
                          ))}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 8px', fontSize: 13, color: 'var(--primary)' }}
                        onClick={() => {
                          setResetValue(''); setLinkStudentId('')
                          setExpanded(expanded === p.parent_id ? null : p.parent_id)
                        }}
                      >
                        {expanded === p.parent_id ? 'Close' : 'Manage'}
                      </button>
                    </td>
                  </tr>
                  {expanded === p.parent_id && (
                    <tr>
                      <td colSpan={4} style={{ background: 'var(--bg)' }}>
                        <div style={{ display: 'grid', gap: 12, padding: '8px 0' }}>
                          {/* Linked children */}
                          <div>
                            <div className="helper" style={{ marginBottom: 6 }}>Linked children</div>
                            {p.children.length === 0 ? (
                              <div className="helper">None yet.</div>
                            ) : p.children.map(c => (
                              <div key={c.student_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span>{c.first_name} {c.last_name}{c.relation ? ` — ${c.relation}` : ''}</span>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '2px 6px', fontSize: 12, color: '#dc2626' }}
                                  disabled={busy}
                                  onClick={() => unlinkStudent(p.parent_id, c.student_id, `${c.first_name} ${c.last_name}`)}
                                >
                                  Unlink
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Link a student */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div>
                              <label className="helper">Link a student</label>
                              <select value={linkStudentId} onChange={e => setLinkStudentId(e.target.value)} style={{ minWidth: 200 }}>
                                <option value="">Select student…</option>
                                {students
                                  .filter(s => !p.children.some(c => c.student_id === s.id))
                                  .map(s => <option key={s.id} value={s.id}>{studentName(s)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="helper">Relation</label>
                              <select value={linkRelation} onChange={e => setLinkRelation(e.target.value)}>
                                {RELATIONS.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                              </select>
                            </div>
                            <button className="btn btn-secondary" disabled={busy || !linkStudentId} onClick={() => linkStudent(p.parent_id)}>
                              Link
                            </button>
                          </div>

                          {/* Password reset */}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div>
                              <label className="helper">Reset password</label>
                              <input
                                type="password"
                                value={resetValue}
                                onChange={e => setResetValue(e.target.value)}
                                placeholder="New password (min 6 chars)"
                                style={{ maxWidth: 240 }}
                              />
                            </div>
                            <button
                              className="btn btn-secondary"
                              disabled={busy || resetValue.length < 6}
                              onClick={() => resetParentPassword(p.user_id)}
                            >
                              Set new password
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
