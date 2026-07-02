import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { QuickEnrollWizard } from '@/ui/components/QuickEnrollWizard'
import { Users, BookOpen, GraduationCap, ClipboardCheck, UserPlus, Upload, Megaphone, Settings } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

interface TeacherRow { id: string; full_name: string; class_count: number }
interface ParentRow { id: string; full_name: string; children: { student_id: string; name: string; relation: string | null }[] }
interface RecentUpdate { id: string; text_content: string; created_at: string; class_name: string }
interface StudentOption { id: string; first_name: string; last_name: string }

export default function AdminDashboard() {
  const { t } = useLanguage()
  const [stats, setStats] = useState({ students: 0, classes: 0, teachers: 0, parents: 0, attendanceRate: null as number | null })
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [parents, setParents] = useState<ParentRow[]>([])
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [attendanceByDay, setAttendanceByDay] = useState<{ day: string; present: number; absent: number }[]>([])
  const [classSizes, setClassSizes] = useState<{ name: string; students: number }[]>([])

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
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: me } = await supabase.from('users').select('school_id').eq('id', user.id).maybeSingle()
        setSchoolId(me?.school_id ?? null)
      }

      const [studentsRes, classesRes, teachersRes, parentsRes] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('classes').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('teachers').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('parents').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      ])

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
        parents: parentsRes.count ?? 0,
        attendanceRate,
      })

      // Attendance trend (last 7 days)
      const days: { day: string; present: number; absent: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        const dateStr = d.toISOString().split('T')[0]
        const { data: dayAtt } = await supabase.from('attendance').select('status').eq('date', dateStr)
        const p = (dayAtt ?? []).filter(a => a.status === 'present').length
        const ab = (dayAtt ?? []).filter(a => a.status !== 'present').length
        days.push({ day: d.toLocaleDateString('en', { weekday: 'short' }), present: p, absent: ab })
      }
      setAttendanceByDay(days)

      // Class sizes
      const { data: classData } = await supabase
        .from('classes').select('id, name, enrollments(id)').is('deleted_at', null)
      setClassSizes((classData ?? []).map((c: any) => ({
        name: c.name?.length > 10 ? c.name.slice(0, 10) + '...' : c.name,
        students: c.enrollments?.length ?? 0,
      })))

      // Teachers
      const { data: teacherData } = await supabase
        .from('teachers').select('id, users(full_name), classes(id)').is('deleted_at', null)
      setTeachers((teacherData ?? []).map((t: any) => ({
        id: t.id, full_name: t.users?.full_name ?? 'Unknown', class_count: (t.classes ?? []).length,
      })))

      // Parents
      const { data: parentData } = await supabase
        .from('parents')
        .select('id, users(full_name), parent_students(student_id, relation, students(first_name, last_name))')
        .is('deleted_at', null)
      setParents((parentData ?? []).map((p: any) => ({
        id: p.id, full_name: p.users?.full_name ?? 'Unknown',
        children: (p.parent_students ?? []).map((ps: any) =>
          ps.students ? { student_id: ps.student_id, name: `${ps.students.first_name} ${ps.students.last_name}`, relation: ps.relation } : null
        ).filter(Boolean),
      })))

      const { data: allStuds } = await supabase.from('students').select('id, first_name, last_name').is('deleted_at', null).order('first_name')
      setAllStudents(allStuds ?? [])

      const { data: updates } = await supabase
        .from('daily_updates').select('id, text_content, created_at, classes(name)')
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(5)
      setRecentUpdates((updates ?? []).map((u: any) => ({
        id: u.id, text_content: u.text_content ?? '', created_at: u.created_at, class_name: u.classes?.name ?? '-',
      })))

      setLoading(false)
    }
    load()
  }, [])

  const COLORS = ['#1d9e55', '#dc2626', '#d97706', '#1a8a7a']

  const attendancePieData = stats.attendanceRate != null
    ? [{ name: 'Present', value: stats.attendanceRate }, { name: 'Absent', value: 100 - stats.attendanceRate }]
    : []

  if (loading) return (
    <div>
      <div className="dash-header"><div className="skeleton" style={{ height: 22, width: 200 }} /></div>
      <div className="stat-grid cols-4" style={{ marginBottom: 16 }}>
        {[1,2,3,4].map(i => <div key={i} className="stat-card"><div className="skeleton" style={{ height: 48 }} /></div>)}
      </div>
    </div>
  )

  const handleLink = async () => {
    if (!linkStudentId || !expandedParent) return
    setLinkSaving(true)
    const { error } = await supabase.from('parent_students').insert({ parent_id: expandedParent, student_id: linkStudentId, relation: linkRelation || null })
    if (!error) {
      const s = allStudents.find(st => st.id === linkStudentId)
      if (s) {
        setParents(prev => prev.map(p =>
          p.id === expandedParent ? { ...p, children: [...p.children, { student_id: s.id, name: `${s.first_name} ${s.last_name}`, relation: linkRelation }] } : p
        ))
      }
      setLinkStudentId('')
    }
    setLinkSaving(false)
  }

  const handleUnlink = async (studentId: string) => {
    if (!confirm('Unlink this student?') || !expandedParent) return
    await supabase.from('parent_students').delete().eq('parent_id', expandedParent).eq('student_id', studentId)
    setParents(prev => prev.map(p =>
      p.id === expandedParent ? { ...p, children: p.children.filter(c => c.student_id !== studentId) } : p
    ))
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="dash-header">
        <h2>{t('admin.title')}</h2>
        <p>{t('admin.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="stat-grid cols-4">
        {[
          { label: t('admin.students'), value: stats.students, color: '#1a8a7a', icon: <Users size={24} /> },
          { label: t('admin.classes'), value: stats.classes, color: '#1a3a4a', icon: <BookOpen size={24} /> },
          { label: t('admin.teachers'), value: stats.teachers, color: '#1d9e55', icon: <GraduationCap size={24} /> },
          { label: t('admin.attendance'), value: stats.attendanceRate != null ? `${stats.attendanceRate}%` : '\u2014', color: '#d97706', icon: <ClipboardCheck size={24} /> },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-accent" style={{ background: s.color }} />
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-icon" style={{ color: s.color }}>{s.icon}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="chart-card">
          <h3>{t('admin.attendanceWeek')}</h3>
          {attendanceByDay.some(d => d.present + d.absent > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={attendanceByDay}>
                <defs>
                  <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d9e55" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#1d9e55" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Area type="monotone" dataKey="present" stroke="#1d9e55" fill="url(#gradPresent)" strokeWidth={2} name={t('admin.present')} />
                <Area type="monotone" dataKey="absent" stroke="#dc2626" fill="rgba(220,38,38,0.08)" strokeWidth={2} name={t('admin.absent')} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty" style={{ padding: 40 }}>{t('admin.noAttendance')}</div>
          )}
        </div>

        <div className="chart-card">
          <h3>{t('admin.studentsPerClass')}</h3>
          {classSizes.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={classSizes}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Bar dataKey="students" radius={[6, 6, 0, 0]} fill="#1a8a7a" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty" style={{ padding: 40 }}>{t('admin.noClassData')}</div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid cols-4 quick-actions">
        <div className="quick-action" style={{ cursor: 'pointer' }} onClick={() => setShowWizard(true)}>
          <div className="quick-action-icon" style={{ background: '#1a8a7a' }}><UserPlus size={20} /></div>
          <div><h4>{t('admin.quickEnroll')}</h4><p>{t('admin.quickEnrollDesc')}</p></div>
        </div>
        <Link to="/app/import" className="quick-action">
          <div className="quick-action-icon" style={{ background: '#1a3a4a' }}><Upload size={20} /></div>
          <div><h4>{t('admin.bulkImport')}</h4><p>{t('admin.bulkImportDesc')}</p></div>
        </Link>
        <Link to="/app/announcements" className="quick-action">
          <div className="quick-action-icon" style={{ background: '#d97706' }}><Megaphone size={20} /></div>
          <div><h4>{t('admin.announce')}</h4><p>{t('admin.announceDesc')}</p></div>
        </Link>
        <Link to="/app/classes" className="quick-action">
          <div className="quick-action-icon" style={{ background: '#1d9e55' }}><Settings size={20} /></div>
          <div><h4>{t('admin.classes')}</h4><p>{t('admin.manageClasses')}</p></div>
        </Link>
      </div>

      {schoolId && <QuickEnrollWizard open={showWizard} onClose={() => setShowWizard(false)} schoolId={schoolId} onComplete={() => window.location.reload()} />}

      {/* Teachers & Parents */}
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="chart-card">
          <h3>{t('admin.teachers')} ({teachers.length})</h3>
          {teachers.length === 0 ? <div className="empty">{t('admin.noTeachers')}</div> : (
            <table><thead><tr><th>{t('common.name')}</th><th>{t('admin.classes')}</th></tr></thead>
            <tbody>{teachers.map(t => (
              <tr key={t.id}><td style={{ fontWeight: 600 }}>{t.full_name}</td><td><span className="badge">{t.class_count}</span></td></tr>
            ))}</tbody></table>
          )}
        </div>
        <div className="chart-card">
          <h3>{t('admin.parents')} ({parents.length})</h3>
          {parents.length === 0 ? <div className="empty">{t('admin.noParents')}</div> : (
            <table><thead><tr><th>{t('common.name')}</th><th>{t('admin.children')}</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>{parents.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => { setExpandedParent(expandedParent === p.id ? null : p.id); setLinkStudentId('') }}>
                <td style={{ fontWeight: 600 }}>{p.full_name}</td>
                <td>{p.children.length === 0 ? <span className="helper">{t('admin.none')}</span> : p.children.map(c => (
                  <span key={c.student_id} className="badge" style={{ marginRight: 4 }}>{c.name}</span>
                ))}</td>
                <td><button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}>{expandedParent === p.id ? t('common.close') : t('admin.link')}</button></td>
              </tr>
            ))}</tbody></table>
          )}
          {expandedParent && (() => {
            const parent = parents.find(p => p.id === expandedParent)
            if (!parent) return null
            const linkedIds = new Set(parent.children.map(c => c.student_id))
            const available = allStudents.filter(s => !linkedIds.has(s.id))
            return (
              <div style={{ marginTop: 12, padding: 14, background: 'var(--bg)', borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('admin.linkStudents')} — {parent.full_name}</div>
                {parent.children.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {parent.children.map(c => (
                      <span key={c.student_id} className="badge" style={{ gap: 6 }}>
                        {c.name}
                        <button onClick={() => handleUnlink(c.student_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 0, fontSize: 14, lineHeight: 1 }}>&times;</button>
                      </span>
                    ))}
                  </div>
                )}
                {available.length > 0 ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={linkStudentId} onChange={e => setLinkStudentId(e.target.value)} style={{ maxWidth: 180, padding: '6px 8px', fontSize: 13 }}>
                      <option value="">{t('admin.selectStudent')}</option>
                      {available.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                    </select>
                    <select value={linkRelation} onChange={e => setLinkRelation(e.target.value)} style={{ maxWidth: 120, padding: '6px 8px', fontSize: 13 }}>
                      <option value="mother">{t('admin.mother')}</option><option value="father">{t('admin.father')}</option><option value="guardian">{t('admin.guardian')}</option>
                    </select>
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={handleLink} disabled={!linkStudentId || linkSaving}>{t('admin.link')}</button>
                  </div>
                ) : <p className="helper" style={{ margin: 0 }}>{t('admin.allLinked')}</p>}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="chart-card">
        <h3>{t('admin.recentUpdates')}</h3>
        {recentUpdates.length === 0 ? <div className="empty">{t('admin.noRecentActivity')}</div> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {recentUpdates.map(u => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="badge badge-info">{u.class_name}</span>
                  <span style={{ fontSize: 14 }}>{u.text_content.length > 60 ? u.text_content.slice(0, 60) + '...' : u.text_content}</span>
                </div>
                <span className="helper" style={{ whiteSpace: 'nowrap' }}>{new Date(u.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
