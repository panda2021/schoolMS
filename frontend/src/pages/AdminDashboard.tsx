import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { QuickEnrollWizard } from '@/ui/components/QuickEnrollWizard'

interface Stats {
  students: number
  classes: number
  teachers: number
  attendanceRate: number | null
}

interface TeacherRow { id: string; full_name: string; class_count: number }
interface ParentRow { id: string; full_name: string; children: { student_id: string; name: string; relation: string | null }[] }
interface RecentUpdate { id: string; text_content: string; created_at: string; class_name: string }

interface StudentOption { id: string; first_name: string; last_name: string }

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [parents, setParents] = useState<ParentRow[]>([])
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([])
  const [loading, setLoading] = useState(true)

  // Parent-student linking
  const [expandedParent, setExpandedParent] = useState<string | null>(null)
  const [allStudents, setAllStudents] = useState<StudentOption[]>([])
  const [linkStudentId, setLinkStudentId] = useState('')
  const [linkRelation, setLinkRelation] = useState('guardian')
  const [linkSaving, setLinkSaving] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [schoolId, setSchoolId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // Get school ID
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: me } = await supabase.from('users').select('school_id').eq('id', user.id).maybeSingle()
        setSchoolId(me?.school_id ?? null)
      }

      // Stats
      const [studentsRes, classesRes, teachersRes] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('classes').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('teachers').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      ])

      // Today's attendance rate
      const today = new Date().toISOString().split('T')[0]
      const { data: attData } = await supabase.from('attendance').select('status').eq('date', today)
      let attendanceRate: number | null = null
      if (attData && attData.length > 0) {
        const present = attData.filter(a => a.status === 'present').length
        attendanceRate = Math.round((present / attData.length) * 100)
      }

      setStats({
        students: studentsRes.count ?? 0,
        classes: classesRes.count ?? 0,
        teachers: teachersRes.count ?? 0,
        attendanceRate,
      })

      // Teachers with class counts
      const { data: teacherData } = await supabase
        .from('teachers')
        .select('id, users(full_name), classes(id)')
        .is('deleted_at', null)
      setTeachers((teacherData ?? []).map((t: any) => ({
        id: t.id,
        full_name: t.users?.full_name ?? 'Unknown',
        class_count: (t.classes ?? []).length,
      })))

      // Parents with children
      const { data: parentData } = await supabase
        .from('parents')
        .select('id, users(full_name), parent_students(student_id, relation, students(first_name, last_name))')
        .is('deleted_at', null)
      setParents((parentData ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.users?.full_name ?? 'Unknown',
        children: (p.parent_students ?? []).map((ps: any) =>
          ps.students ? { student_id: ps.student_id, name: `${ps.students.first_name} ${ps.students.last_name}`, relation: ps.relation } : null
        ).filter(Boolean),
      })))

      // All students for linking dropdown
      const { data: allStuds } = await supabase.from('students').select('id, first_name, last_name').is('deleted_at', null).order('first_name')
      setAllStudents(allStuds ?? [])

      // Recent updates
      const { data: updates } = await supabase
        .from('daily_updates')
        .select('id, text_content, created_at, classes(name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentUpdates((updates ?? []).map((u: any) => ({
        id: u.id,
        text_content: u.text_content ?? '',
        created_at: u.created_at,
        class_name: u.classes?.name ?? '-',
      })))

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="skeleton" style={{ height: 18, width: 220, borderRadius: 8 }} />
        <div className="grid cols-2" style={{ marginTop: 12 }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />)}
        </div>
      </div>
    </div>
  )

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* Stats */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Admin Dashboard</h2>
        <div className="grid cols-2" style={{ gap: 10 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{stats?.students}</div>
            <div className="helper">Students</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{stats?.classes}</div>
            <div className="helper">Classes</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{stats?.teachers}</div>
            <div className="helper">Teachers</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: stats?.attendanceRate != null ? 'var(--accent)' : 'var(--muted)' }}>
              {stats?.attendanceRate != null ? `${stats.attendanceRate}%` : '—'}
            </div>
            <div className="helper">Today's Attendance</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid cols-2" style={{ gap: 10 }}>
        <div className="card" style={{ textAlign: 'center', padding: 20, cursor: 'pointer' }} onClick={() => setShowWizard(true)}>
          <h4 style={{ margin: '0 0 6px 0', color: 'var(--primary)' }}>Quick Enroll</h4>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>Create student + assign class + link parent in one step</p>
        </div>
        <Link to="/app/import" className="link-card card" style={{ textAlign: 'center', padding: 20 }}>
          <h4>Bulk Import</h4>
          <p>Upload Excel/CSV to import students or classes</p>
        </Link>
        <Link to="/app/classes" className="link-card card" style={{ textAlign: 'center', padding: 20 }}>
          <h4>Manage Classes</h4>
          <p>Create, edit, and manage class enrollments</p>
        </Link>
        <Link to="/app/announcements" className="link-card card" style={{ textAlign: 'center', padding: 20 }}>
          <h4>Announcements</h4>
          <p>Post school-wide or class announcements</p>
        </Link>
      </div>

      {schoolId && <QuickEnrollWizard open={showWizard} onClose={() => setShowWizard(false)} schoolId={schoolId} onComplete={() => window.location.reload()} />}

      {/* Teachers & Parents */}
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Teachers</h3>
          {teachers.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>No teachers found.</div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Classes</th></tr></thead>
              <tbody>
                {teachers.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.full_name}</td>
                    <td><span className="badge">{t.class_count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Parents</h3>
          {parents.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>No parents found.</div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Children</th><th style={{ width: 100 }}>Actions</th></tr></thead>
              <tbody>
                {parents.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => {
                    setExpandedParent(expandedParent === p.id ? null : p.id)
                    setLinkStudentId(''); setLinkRelation('guardian')
                  }}>
                    <td style={{ fontWeight: 500 }}>{p.full_name}</td>
                    <td>
                      {p.children.length === 0
                        ? <span className="helper">None linked</span>
                        : p.children.map(c => (
                          <span key={c.student_id} className="badge" style={{ marginRight: 4 }}>
                            {c.name}{c.relation ? ` (${c.relation})` : ''}
                          </span>
                        ))
                      }
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}
                        onClick={() => {
                          setExpandedParent(expandedParent === p.id ? null : p.id)
                          setLinkStudentId(''); setLinkRelation('guardian')
                        }}>
                        {expandedParent === p.id ? 'Close' : 'Link'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Parent-Student Linking Panel */}
          {expandedParent && (() => {
            const parent = parents.find(p => p.id === expandedParent)
            if (!parent) return null
            const linkedIds = new Set(parent.children.map(c => c.student_id))
            const available = allStudents.filter(s => !linkedIds.has(s.id))

            const handleLink = async () => {
              if (!linkStudentId) return
              setLinkSaving(true)
              const { error } = await supabase.from('parent_students').insert({
                parent_id: expandedParent,
                student_id: linkStudentId,
                relation: linkRelation || null,
              })
              if (error) { console.error(error) }
              else {
                // Refresh parents data
                const s = allStudents.find(st => st.id === linkStudentId)
                if (s) {
                  setParents(prev => prev.map(p =>
                    p.id === expandedParent
                      ? { ...p, children: [...p.children, { student_id: s.id, name: `${s.first_name} ${s.last_name}`, relation: linkRelation }] }
                      : p
                  ))
                }
                setLinkStudentId('')
              }
              setLinkSaving(false)
            }

            const handleUnlink = async (studentId: string) => {
              if (!confirm('Unlink this student from parent?')) return
              await supabase.from('parent_students').delete().eq('parent_id', expandedParent).eq('student_id', studentId)
              setParents(prev => prev.map(p =>
                p.id === expandedParent
                  ? { ...p, children: p.children.filter(c => c.student_id !== studentId) }
                  : p
              ))
            }

            return (
              <div className="card" style={{ marginTop: 8, background: 'var(--bg)' }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Link Students — {parent.full_name}</h4>
                {parent.children.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {parent.children.map(c => (
                      <span key={c.student_id} className="badge" style={{ gap: 6 }}>
                        {c.name}{c.relation ? ` (${c.relation})` : ''}
                        <button onClick={() => handleUnlink(c.student_id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0, fontSize: 14, lineHeight: 1 }}
                          title="Unlink">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
                {available.length > 0 ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={linkStudentId} onChange={e => setLinkStudentId(e.target.value)} style={{ maxWidth: 200, padding: '6px 8px' }}>
                      <option value="">Select student...</option>
                      {available.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                    </select>
                    <select value={linkRelation} onChange={e => setLinkRelation(e.target.value)} style={{ maxWidth: 140, padding: '6px 8px' }}>
                      <option value="mother">Mother</option>
                      <option value="father">Father</option>
                      <option value="guardian">Guardian</option>
                    </select>
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={handleLink} disabled={!linkStudentId || linkSaving}>
                      Link
                    </button>
                  </div>
                ) : (
                  <p className="helper">All students are linked to this parent.</p>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent Updates</h3>
        {recentUpdates.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>No recent activity.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {recentUpdates.map(u => (
              <li key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <span className="badge" style={{ marginRight: 8 }}>{u.class_name}</span>
                  <span>{u.text_content.length > 80 ? u.text_content.slice(0, 80) + '...' : u.text_content}</span>
                </div>
                <span className="helper" style={{ whiteSpace: 'nowrap', marginLeft: 12 }}>
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
