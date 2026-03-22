import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'

interface ClassRow { id: string; name: string }
interface StudentRow { id: string; first_name: string; last_name: string }

export default function Attendance() {
  const [role, setRole] = useState<'teacher' | 'parent' | 'school_admin' | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [students, setStudents] = useState<StudentRow[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [teacherId, setTeacherId] = useState<string>('')
  const [schoolId, setSchoolId] = useState<string>('')
  const { show } = useToast()
  const [classesError, setClassesError] = useState<string | null>(null)
  const [studentsError, setStudentsError] = useState<string | null>(null)

  useEffect(() => {
    const loadClasses = async () => {
      setLoadingClasses(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('role_key').eq('id', user.id).maybeSingle()
      if (userRow) setRole(userRow.role_key)
      // Load teacher id and school id for later use
      const { data: teacher } = await supabase.from('teachers').select('id, school_id').eq('user_id', user.id).maybeSingle()
      if (!teacher) { setLoadingClasses(false); return }
      setTeacherId(teacher.id)
      setSchoolId(teacher.school_id)
      const { data: classRows, error } = await supabase.from('classes').select('id, name').eq('teacher_id', teacher.id).is('deleted_at', null)
      if (error) {
        console.error(error)
        setClassesError('Failed to load classes.')
      }
      setClasses(classRows ?? [])
      setLoadingClasses(false)
    }
    loadClasses()
  }, [])

  useEffect(() => {
    const loadStudents = async () => {
      if (!selectedClass) return
      setLoadingStudents(true)
      setStudentsError(null)
      const { data: enrolls, error: enrollErr } = await supabase.from('enrollments').select('student_id').eq('class_id', selectedClass).is('deleted_at', null)
      if (enrollErr) {
        console.error(enrollErr)
        setStudentsError('Failed to load students.')
        setStudents([])
        setLoadingStudents(false)
        return
      }
      const ids = (enrolls ?? []).map((e) => e.student_id)
      if (ids.length === 0) { setStudents([]); return }
      const { data: studs, error: studsErr } = await supabase.from('students').select('id, first_name, last_name').in('id', ids).is('deleted_at', null)
      if (studsErr) {
        console.error(studsErr)
        setStudentsError('Failed to load students.')
      }
      setStudents(studs ?? [])
      setLoadingStudents(false)
    }
    loadStudents()
  }, [selectedClass])

  const save = async () => {
    setSaving(true)
    const rows = Object.entries(statusMap).map(([student_id, status]) => ({
      school_id: schoolId,
      class_id: selectedClass,
      student_id,
      status,
      date,
      created_by: teacherId,
    }))
    if (rows.length > 0) {
      const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'class_id,student_id,date' })
      if (error) {
        show(error.message, 'error')
      } else {
        show('Attendance saved', 'success')
      }
    }
    setSaving(false)
  }

  const statuses = useMemo(() => ['present','absent','late','excused'], [])

  const markAll = (status: string) => {
    const next: Record<string, string> = {}
    for (const s of students) next[s.id] = status
    setStatusMap(next)
  }

  // Parent attendance view state
  const [children, setChildren] = useState<{ id: string; name: string }[]>([])
  const [selectedChild, setSelectedChild] = useState('')
  const [attendanceHistory, setAttendanceHistory] = useState<{ date: string; status: string; class_name: string; notes: string | null }[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Load parent's children
  useEffect(() => {
    if (role !== 'parent') return
    const loadChildren = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: p } = await supabase.from('parents').select('id').eq('user_id', user.id).maybeSingle()
      if (!p?.id) return
      const { data: ps } = await supabase.from('parent_students').select('students(id, first_name, last_name)').eq('parent_id', p.id)
      const kids = (ps ?? []).map((r: any) => r.students ? { id: r.students.id, name: `${r.students.first_name} ${r.students.last_name}` } : null).filter(Boolean) as { id: string; name: string }[]
      setChildren(kids)
      if (kids.length === 1) setSelectedChild(kids[0].id)
    }
    loadChildren()
  }, [role])

  // Load attendance history for selected child
  useEffect(() => {
    if (!selectedChild || role !== 'parent') return
    const loadHistory = async () => {
      setLoadingHistory(true)
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      const { data } = await supabase
        .from('attendance')
        .select('date, status, notes, classes(name)')
        .eq('student_id', selectedChild)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: false })
      setAttendanceHistory((data ?? []).map((a: any) => ({
        date: a.date,
        status: a.status,
        class_name: a.classes?.name ?? '-',
        notes: a.notes,
      })))
      setLoadingHistory(false)
    }
    loadHistory()
  }, [selectedChild, role])

  const attendanceSummary = () => {
    const present = attendanceHistory.filter(a => a.status === 'present').length
    const absent = attendanceHistory.filter(a => a.status === 'absent').length
    const late = attendanceHistory.filter(a => a.status === 'late').length
    return { present, absent, late, total: attendanceHistory.length }
  }

  const statusBadge = (status: string) => {
    if (status === 'present') return <span className="badge badge-success">Present</span>
    if (status === 'absent') return <span className="badge badge-danger">Absent</span>
    if (status === 'late') return <span className="badge badge-warning">Late</span>
    return <span className="badge">{status}</span>
  }

  return (
    <div>
      <h2>Attendance</h2>

      {/* Parent view */}
      {role === 'parent' && (
        <div className="card">
          {children.length === 0 ? (
            <p className="helper">No children linked to your account.</p>
          ) : (
            <>
              {children.length > 1 && (
                <div style={{ marginBottom: 12 }}>
                  <label className="helper">Select Child</label>
                  <select value={selectedChild} onChange={e => setSelectedChild(e.target.value)}>
                    <option value="">Choose...</option>
                    {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {selectedChild && (
                <>
                  {(() => { const s = attendanceSummary(); return s.total > 0 ? (
                    <div className="grid cols-3" style={{ gap: 8, marginBottom: 12 }}>
                      <div className="card" style={{ textAlign: 'center', padding: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>{s.present}</div>
                        <div className="helper">Present</div>
                      </div>
                      <div className="card" style={{ textAlign: 'center', padding: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{s.absent}</div>
                        <div className="helper">Absent</div>
                      </div>
                      <div className="card" style={{ textAlign: 'center', padding: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#92400e' }}>{s.late}</div>
                        <div className="helper">Late</div>
                      </div>
                    </div>
                  ) : null })()}
                  {loadingHistory ? (
                    <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
                  ) : attendanceHistory.length === 0 ? (
                    <p className="helper">No attendance records this month.</p>
                  ) : (
                    <table>
                      <thead><tr><th>Date</th><th>Status</th><th>Class</th><th>Notes</th></tr></thead>
                      <tbody>
                        {attendanceHistory.map(a => (
                          <tr key={a.date + a.class_name}>
                            <td>{new Date(a.date).toLocaleDateString()}</td>
                            <td>{statusBadge(a.status)}</td>
                            <td>{a.class_name}</td>
                            <td>{a.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Admin/other non-teacher view */}
      {role !== 'teacher' && role !== 'parent' && (
        <p className="helper">Attendance marking is available to teachers. Parents can view attendance history above.</p>
      )}

      {/* Teacher view */}
      {role === 'teacher' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label htmlFor="classSel" className="helper">Class</label>
          {loadingClasses ? (
            <div className="skeleton" style={{ width: 200, height: 36, borderRadius: 8 }} />
          ) : (
            <select id="classSel" aria-label="Select class" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              <option value="">Select class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <label htmlFor="dateSel" className="helper">Date</label>
          <input id="dateSel" type="date" aria-label="Select date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn btn-primary" onClick={save} disabled={!selectedClass || saving} aria-label="Save attendance" style={{ display:'inline-flex', alignItems:'center', gap:8, minWidth:96, justifyContent:'center' }}>
            {saving ? (<><LoadingSpinner size="sm" /> Saving…</>) : 'Save'}
          </button>
        </div>
      )}

      {classesError && (
        <p className="helper" role="status" style={{ color: 'var(--danger)' }}>{classesError}</p>
      )}

      {!selectedClass ? (
        role === 'teacher' ? <p className="helper">Select a class to begin.</p> : null
      ) : loadingStudents ? (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="card" style={{ padding: 12 }}>
              <div className="skeleton" style={{ width: '40%', height: 12 }} />
            </li>
          ))}
        </ul>
      ) : students.length === 0 ? (
        <p className="helper">No students in this class.</p>
      ) : (
        <>
        {studentsError && (
          <p className="helper" role="status" style={{ color: 'var(--danger)' }}>{studentsError}</p>
        )}
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <button className="btn btn-secondary" onClick={() => markAll('present')} aria-label="Mark all present">All Present</button>
          <button className="btn btn-secondary" onClick={() => markAll('absent')} aria-label="Mark all absent">All Absent</button>
        </div>
        <table width="100%" cellPadding="8" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Student</th>
              {statuses.map(s => <th key={s}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.first_name} {s.last_name}</td>
                {statuses.map(st => (
                  <td key={st} align="center">
                    <input
                      type="radio"
                      name={`st-${s.id}`}
                      aria-label={`${s.first_name} ${s.last_name} ${st}`}
                      checked={statusMap[s.id] === st}
                      onChange={() => setStatusMap(prev => ({ ...prev, [s.id]: st }))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </div>
  )
}
