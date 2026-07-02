import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { useFeature } from '@/ui/features/FeatureProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { useLanguage } from '@/i18n/LanguageProvider'

interface ClassRow { id: string; name: string; grade_level?: string | null }
interface StudentRow { id: string; first_name: string; last_name: string }

interface AdminAttendanceRow {
  id: string
  date: string
  status: string
  notes: string | null
  student_id: string
  student_name: string
  class_id: string
  class_name: string
  grade_level: string | null
  recorded_by: string | null
}

export default function Attendance() {
  const { t } = useLanguage()
  const [role, setRole] = useState<'teacher' | 'parent' | 'school_admin' | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [students, setStudents] = useState<StudentRow[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [attendanceTaken, setAttendanceTaken] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [takenAt, setTakenAt] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState<string>('')
  const [schoolId, setSchoolId] = useState<string>('')
  const { show } = useToast()
  const { can } = useFeature()
  const [classesError, setClassesError] = useState<string | null>(null)
  const [studentsError, setStudentsError] = useState<string | null>(null)

  useEffect(() => {
    const loadClasses = async () => {
      setLoadingClasses(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingClasses(false); return }
      const { data: userRow } = await supabase
        .from('users')
        .select('role_key, school_id')
        .eq('id', user.id)
        .maybeSingle()
      if (userRow) setRole(userRow.role_key)

      if (userRow?.role_key === 'school_admin') {
        const sid: string = userRow.school_id ?? ''
        setSchoolId(sid)
        if (sid) {
          const { data: classRows, error } = await supabase
            .from('classes')
            .select('id, name, grade_level')
            .eq('school_id', sid)
            .is('deleted_at', null)
            .order('name')
          if (error) { console.error(error); setClassesError('Failed to load classes.') }
          setClasses((classRows ?? []) as ClassRow[])
        }
        setLoadingClasses(false)
        return
      }

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
      if (!selectedClass || role !== 'teacher') return
      setLoadingStudents(true)
      setStudentsError(null)
      setAttendanceTaken(false)
      setEditMode(false)
      setTakenAt(null)
      setStatusMap({})
      const { data: enrolls, error: enrollErr } = await supabase.from('enrollments').select('student_id').eq('class_id', selectedClass).is('deleted_at', null)
      if (enrollErr) {
        console.error(enrollErr)
        setStudentsError('Failed to load students.')
        setStudents([])
        setLoadingStudents(false)
        return
      }
      const ids = (enrolls ?? []).map((e) => e.student_id)
      if (ids.length === 0) { setStudents([]); setLoadingStudents(false); return }
      const { data: studs, error: studsErr } = await supabase.from('students').select('id, first_name, last_name').in('id', ids).is('deleted_at', null)
      if (studsErr) {
        console.error(studsErr)
        setStudentsError('Failed to load students.')
      }
      setStudents(studs ?? [])

      const { data: existing } = await supabase
        .from('attendance')
        .select('student_id, status, created_at')
        .eq('class_id', selectedClass)
        .eq('date', date)
      if (existing && existing.length > 0) {
        const m: Record<string, string> = {}
        for (const a of existing) m[a.student_id] = a.status
        setStatusMap(m)
        setAttendanceTaken(true)
        setEditMode(false)
        setTakenAt(existing[0].created_at)
      }

      setLoadingStudents(false)
    }
    loadStudents()
  }, [selectedClass, date, role])

  const save = async () => {
    if (attendanceTaken && !editMode) {
      show('Click "Edit attendance" first to make changes.', 'error')
      return
    }
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
        show(attendanceTaken ? 'Attendance updated' : 'Attendance saved', 'success')
        setAttendanceTaken(true)
        setEditMode(false)
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
    if (status === 'present') return <span className="badge badge-success">{t('attendance.present')}</span>
    if (status === 'absent') return <span className="badge badge-danger">{t('attendance.absent')}</span>
    if (status === 'late') return <span className="badge badge-warning">{t('attendance.late')}</span>
    return <span className="badge">{status}</span>
  }

  // ----- Admin view state -----
  const todayStr = new Date().toISOString().slice(0, 10)
  const [adminStart, setAdminStart] = useState<string>(todayStr)
  const [adminEnd, setAdminEnd] = useState<string>(todayStr)
  const [adminClassId, setAdminClassId] = useState<string>('')
  const [adminGrade, setAdminGrade] = useState<string>('')
  const [adminStatus, setAdminStatus] = useState<string>('')
  const [adminSearch, setAdminSearch] = useState<string>('')
  const [adminRows, setAdminRows] = useState<AdminAttendanceRow[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)

  const grades = useMemo(() => {
    const set = new Set<string>()
    for (const c of classes) if (c.grade_level) set.add(c.grade_level)
    return Array.from(set).sort()
  }, [classes])

  useEffect(() => {
    if (role !== 'school_admin' || !schoolId) return
    let cancelled = false
    const load = async () => {
      setAdminLoading(true)
      setAdminError(null)
      let q = supabase
        .from('attendance')
        .select('id, date, status, notes, student_id, class_id, created_by, students(first_name, last_name), classes(name, grade_level, school_id)')
        .gte('date', adminStart)
        .lte('date', adminEnd)
        .order('date', { ascending: false })
        .limit(1000)
      if (adminClassId) q = q.eq('class_id', adminClassId)
      if (adminStatus) q = q.eq('status', adminStatus)
      const { data, error } = await q
      if (cancelled) return
      if (error) {
        console.error(error)
        setAdminError('Failed to load attendance.')
        setAdminRows([])
        setAdminLoading(false)
        return
      }

      const creatorIds = Array.from(new Set((data ?? []).map((r: any) => r.created_by).filter(Boolean)))
      let creatorMap: Record<string, string> = {}
      if (creatorIds.length > 0) {
        const { data: teachersRows } = await supabase
          .from('teachers')
          .select('id, users(full_name)')
          .in('id', creatorIds)
        for (const tr of (teachersRows ?? []) as any[]) {
          creatorMap[tr.id] = tr.users?.full_name ?? '-'
        }
      }

      const mapped: AdminAttendanceRow[] = (data ?? [])
        .filter((r: any) => r.classes && r.classes.school_id === schoolId)
        .map((r: any) => ({
          id: r.id,
          date: r.date,
          status: r.status,
          notes: r.notes,
          student_id: r.student_id,
          student_name: r.students ? `${r.students.first_name} ${r.students.last_name}` : '-',
          class_id: r.class_id,
          class_name: r.classes?.name ?? '-',
          grade_level: r.classes?.grade_level ?? null,
          recorded_by: r.created_by ? (creatorMap[r.created_by] ?? '-') : null,
        }))

      setAdminRows(mapped)
      setAdminLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [role, schoolId, adminStart, adminEnd, adminClassId, adminStatus])

  const adminFilteredRows = useMemo(() => {
    let rows = adminRows
    if (adminGrade) rows = rows.filter(r => (r.grade_level ?? '') === adminGrade)
    if (adminSearch.trim()) {
      const q = adminSearch.trim().toLowerCase()
      rows = rows.filter(r => r.student_name.toLowerCase().includes(q))
    }
    return rows
  }, [adminRows, adminGrade, adminSearch])

  const adminSummary = useMemo(() => {
    const total = adminFilteredRows.length
    const present = adminFilteredRows.filter(r => r.status === 'present').length
    const absent = adminFilteredRows.filter(r => r.status === 'absent').length
    const late = adminFilteredRows.filter(r => r.status === 'late').length
    const excused = adminFilteredRows.filter(r => r.status === 'excused').length
    const rate = total === 0 ? 0 : Math.round((present / total) * 100)
    return { total, present, absent, late, excused, rate }
  }, [adminFilteredRows])

  const exportAdminCsv = () => {
    if (adminFilteredRows.length === 0) {
      show('Nothing to export.', 'error')
      return
    }
    const header = ['Date', 'Student', 'Class', 'Grade', 'Status', 'Recorded by', 'Notes']
    const escape = (v: any) => {
      const s = v == null ? '' : String(v)
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const lines = [header.join(',')]
    for (const r of adminFilteredRows) {
      lines.push([
        r.date,
        r.student_name,
        r.class_name,
        r.grade_level ?? '',
        r.status,
        r.recorded_by ?? '',
        r.notes ?? '',
      ].map(escape).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance_${adminStart}_to_${adminEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h2>{t('attendance.title')}</h2>

      {/* Parent view (child-scoped capability) */}
      {role === 'parent' && can('children.attendance.view') && (
        <div className="card">
          {children.length === 0 ? (
            <p className="helper">{t('attendance.noChildren')}</p>
          ) : (
            <>
              {children.length > 1 && (
                <div style={{ marginBottom: 12 }}>
                  <label className="helper">{t('attendance.selectChild')}</label>
                  <select value={selectedChild} onChange={e => setSelectedChild(e.target.value)}>
                    <option value="">{t('attendance.choose')}</option>
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
                        <div className="helper">{t('attendance.present')}</div>
                      </div>
                      <div className="card" style={{ textAlign: 'center', padding: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{s.absent}</div>
                        <div className="helper">{t('attendance.absent')}</div>
                      </div>
                      <div className="card" style={{ textAlign: 'center', padding: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#92400e' }}>{s.late}</div>
                        <div className="helper">{t('attendance.late')}</div>
                      </div>
                    </div>
                  ) : null })()}
                  {loadingHistory ? (
                    <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
                  ) : attendanceHistory.length === 0 ? (
                    <p className="helper">{t('attendance.noRecords')}</p>
                  ) : (
                    <table>
                      <thead><tr><th>{t('attendance.date')}</th><th>{t('attendance.status')}</th><th>{t('attendance.class')}</th><th>{t('attendance.notes')}</th></tr></thead>
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

      {/* Admin view */}
      {role === 'school_admin' && (
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <div>
                <label className="helper" htmlFor="adminStart">From</label>
                <input id="adminStart" type="date" value={adminStart} max={adminEnd} onChange={e => setAdminStart(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="helper" htmlFor="adminEnd">To</label>
                <input id="adminEnd" type="date" value={adminEnd} min={adminStart} max={todayStr} onChange={e => setAdminEnd(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="helper" htmlFor="adminClass">Class</label>
                <select id="adminClass" value={adminClassId} onChange={e => setAdminClassId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">All classes</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="helper" htmlFor="adminGrade">Grade</label>
                <select id="adminGrade" value={adminGrade} onChange={e => setAdminGrade(e.target.value)} style={{ width: '100%' }}>
                  <option value="">All grades</option>
                  {grades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="helper" htmlFor="adminStatus">Status</label>
                <select id="adminStatus" value={adminStatus} onChange={e => setAdminStatus(e.target.value)} style={{ width: '100%' }}>
                  <option value="">All statuses</option>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="helper" htmlFor="adminSearch">Student</label>
                <input id="adminSearch" placeholder="Search by name" value={adminSearch} onChange={e => setAdminSearch(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {can('attendance.export') && <button className="btn btn-secondary" onClick={exportAdminCsv} disabled={adminFilteredRows.length === 0}>Export CSV</button>}
            </div>
          </div>

          <div className="grid cols-4" style={{ gap: 8, marginBottom: 12 }}>
            <div className="card" style={{ textAlign: 'center', padding: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{adminSummary.total}</div>
              <div className="helper">Records</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>{adminSummary.present}</div>
              <div className="helper">Present</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{adminSummary.absent}</div>
              <div className="helper">Absent</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#92400e' }}>{adminSummary.late + adminSummary.excused}</div>
              <div className="helper">Late / excused</div>
            </div>
          </div>

          {adminError && (
            <p className="helper" role="status" style={{ color: 'var(--danger)' }}>{adminError}</p>
          )}

          {adminLoading ? (
            <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
          ) : adminFilteredRows.length === 0 ? (
            <p className="helper">No attendance records match the current filters.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Grade</th>
                  <th>Status</th>
                  <th>Recorded by</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {adminFilteredRows.map(r => (
                  <tr key={r.id}>
                    <td>{new Date(r.date).toLocaleDateString()}</td>
                    <td>{r.student_name}</td>
                    <td>{r.class_name}</td>
                    <td>{r.grade_level ?? '-'}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td>{r.recorded_by ?? '-'}</td>
                    <td>{r.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="helper" style={{ marginTop: 8 }}>
            Showing up to 1000 records per date range. Narrow the date range if you need to see older history.
          </p>
        </div>
      )}

      {/* Fallback for unknown roles */}
      {role !== 'teacher' && role !== 'parent' && role !== 'school_admin' && (
        <p className="helper">{t('attendance.parentNote')}</p>
      )}

      {/* Teacher view */}
      {role === 'teacher' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label htmlFor="classSel" className="helper">Class</label>
          {loadingClasses ? (
            <div className="skeleton" style={{ width: 200, height: 36, borderRadius: 8 }} />
          ) : (
            <select id="classSel" aria-label="Select class" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              <option value="">{t('attendance.selectClass')}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <label htmlFor="dateSel" className="helper">Date</label>
          <input id="dateSel" type="date" aria-label="Select date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          {attendanceTaken && !editMode ? (
            <button className="btn btn-secondary" onClick={() => setEditMode(true)} aria-label="Edit attendance">
              {t('attendance.edit') || 'Edit attendance'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={save} disabled={!selectedClass || saving} aria-label="Save attendance" style={{ display:'inline-flex', alignItems:'center', gap:8, minWidth:96, justifyContent:'center' }}>
              {saving ? (<><LoadingSpinner size="sm" /> {t('common.saving')}</>) : (attendanceTaken ? (t('attendance.update') || 'Update') : t('attendance.save'))}
            </button>
          )}
        </div>
      )}

      {role === 'teacher' && attendanceTaken && !editMode && selectedClass && (
        <div className="card" style={{ background: '#fef3c7', border: '1px solid #fbbf24', padding: 10, marginBottom: 12 }}>
          <strong>Attendance already taken</strong> for this class on {new Date(date).toLocaleDateString()}
          {takenAt ? <span className="helper"> (recorded {new Date(takenAt).toLocaleString()})</span> : null}.
          Click <em>Edit attendance</em> to make corrections.
        </div>
      )}

      {role === 'teacher' && classesError && (
        <p className="helper" role="status" style={{ color: 'var(--danger)' }}>{classesError}</p>
      )}

      {role === 'teacher' && (!selectedClass ? (
        <p className="helper">{t('attendance.selectClassPrompt')}</p>
      ) : loadingStudents ? (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="card" style={{ padding: 12 }}>
              <div className="skeleton" style={{ width: '40%', height: 12 }} />
            </li>
          ))}
        </ul>
      ) : students.length === 0 ? (
        <p className="helper">{t('attendance.noStudents')}</p>
      ) : (
        <>
        {studentsError && (
          <p className="helper" role="status" style={{ color: 'var(--danger)' }}>{studentsError}</p>
        )}
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          <button className="btn btn-secondary" onClick={() => markAll('present')} aria-label="Mark all present">{t('attendance.allPresent')}</button>
          <button className="btn btn-secondary" onClick={() => markAll('absent')} aria-label="Mark all absent">{t('attendance.allAbsent')}</button>
        </div>
        <table width="100%" cellPadding="8" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">{t('attendance.student')}</th>
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
                      disabled={attendanceTaken && !editMode}
                      onChange={() => setStatusMap(prev => ({ ...prev, [s.id]: st }))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </>
      ))}
    </div>
  )
}
