import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useLanguage } from '@/i18n/LanguageProvider'
import { BookOpen, Users, FileText, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

interface ClassInfo { id: string; name: string; student_count: number; attendance_done: boolean }

export default function TeacherDashboard() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ classes: 0, students: 0, updatesThisWeek: 0, attendanceRate: null as number | null })
  const [myClasses, setMyClasses] = useState<ClassInfo[]>([])
  const [attendancePie, setAttendancePie] = useState<{ name: string; value: number }[]>([])
  const [classStudents, setClassStudents] = useState<{ name: string; count: number }[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: t } = await supabase.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
      if (!t?.id) { setLoading(false); return }

      const teacherId = t.id
      const today = new Date().toISOString().split('T')[0]
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

      const { data: classData } = await supabase
        .from('classes').select('id, name, enrollments(id)').eq('teacher_id', teacherId).is('deleted_at', null)

      const classIds = (classData ?? []).map(c => c.id)

      const { data: attData } = classIds.length > 0
        ? await supabase.from('attendance').select('class_id, status').eq('date', today).in('class_id', classIds)
        : { data: [] }

      const attendedClassIds = new Set((attData ?? []).map(a => a.class_id))
      const totalStudents = (classData ?? []).reduce((sum: number, c: any) => sum + (c.enrollments?.length ?? 0), 0)

      const classInfos: ClassInfo[] = (classData ?? []).map((c: any) => ({
        id: c.id, name: c.name, student_count: c.enrollments?.length ?? 0, attendance_done: attendedClassIds.has(c.id),
      }))

      let attendanceRate: number | null = null
      if (attData && attData.length > 0) {
        const present = attData.filter(a => a.status === 'present').length
        const late = attData.filter(a => a.status === 'late').length
        const absent = attData.filter(a => a.status === 'absent').length
        attendanceRate = Math.round((present / attData.length) * 100)
        setAttendancePie([
          { name: 'Present', value: present },
          { name: 'Late', value: late },
          { name: 'Absent', value: absent },
        ].filter(d => d.value > 0))
      }

      setClassStudents((classData ?? []).map((c: any) => ({
        name: c.name?.length > 12 ? c.name.slice(0, 12) + '..' : c.name,
        count: c.enrollments?.length ?? 0,
      })))

      const { count: weekUpdates } = await supabase
        .from('daily_updates').select('*', { count: 'exact', head: true })
        .eq('teacher_id', teacherId).gte('created_at', weekAgo)

      setStats({ classes: classInfos.length, students: totalStudents, updatesThisWeek: weekUpdates ?? 0, attendanceRate })
      setMyClasses(classInfos)
      setLoading(false)
    }
    load()
  }, [])

  const PIE_COLORS = ['#1d9e55', '#d97706', '#dc2626']

  if (loading) return (
    <div>
      <div className="dash-header"><div className="skeleton" style={{ height: 22, width: 200 }} /></div>
      <div className="stat-grid cols-4">{[1,2,3,4].map(i => <div key={i} className="stat-card"><div className="skeleton" style={{ height: 48 }} /></div>)}</div>
    </div>
  )

  const unattended = myClasses.filter(c => !c.attendance_done && c.student_count > 0)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="dash-header">
        <h2>{t('teacher.title')}</h2>
        <p>{t('teacher.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="stat-grid cols-4">
        {[
          { label: t('teacher.myClasses'), value: stats.classes, color: '#1a8a7a', icon: <BookOpen size={24} /> },
          { label: t('teacher.myStudents'), value: stats.students, color: '#1a3a4a', icon: <Users size={24} /> },
          { label: t('teacher.updatesWeek'), value: stats.updatesThisWeek, color: '#1d9e55', icon: <FileText size={24} /> },
          { label: t('teacher.attendance'), value: stats.attendanceRate != null ? `${stats.attendanceRate}%` : '\u2014', color: '#d97706', icon: <ClipboardCheck size={24} /> },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-accent" style={{ background: s.color }} />
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-icon" style={{ color: s.color }}>{s.icon}</div>
          </div>
        ))}
      </div>

      {/* Attendance nudge */}
      {unattended.length > 0 && (
        <div className="chart-card" style={{ borderLeft: '4px solid #d97706', display: 'flex', alignItems: 'center', gap: 14 }}>
          <AlertTriangle size={22} style={{ color: '#d97706', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{t('teacher.attendanceNotTaken')}</div>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              {unattended.map(c => c.name).join(', ')} &mdash; <Link to="/app/attendance" style={{ color: 'var(--primary)', fontWeight: 600 }}>{t('teacher.takeAttendanceNow')}</Link>
            </p>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="chart-card">
          <h3>{t('teacher.todaysAttendance')}</h3>
          {attendancePie.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={attendancePie} cx="50%" cy="50%" innerRadius={36} outerRadius={60} dataKey="value" strokeWidth={2}>
                    {attendancePie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'grid', gap: 8 }}>
                {attendancePie.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: PIE_COLORS[i] }} />
                    <span style={{ fontWeight: 600 }}>{d.value}</span> <span style={{ color: 'var(--muted)' }}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty" style={{ padding: 32 }}>{t('teacher.noAttendance')}</div>
          )}
        </div>

        <div className="chart-card">
          <h3>{t('teacher.studentsPerClass')}</h3>
          {classStudents.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={classStudents}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#1a3a4a" name="Students" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty" style={{ padding: 32 }}>{t('teacher.noClasses')}</div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid cols-3 quick-actions">
        <Link to="/app/attendance" className="quick-action">
          <div className="quick-action-icon" style={{ background: '#1d9e55' }}><ClipboardCheck size={20} /></div>
          <div><h4>{t('teacher.takeAttendance')}</h4><p>{t('teacher.takeAttendanceDesc')}</p></div>
        </Link>
        <Link to="/app/updates" className="quick-action">
          <div className="quick-action-icon" style={{ background: '#1a8a7a' }}><FileText size={20} /></div>
          <div><h4>{t('teacher.postUpdate')}</h4><p>{t('teacher.postUpdateDesc')}</p></div>
        </Link>
        <Link to="/app/reports" className="quick-action">
          <div className="quick-action-icon" style={{ background: '#1a3a4a' }}><BookOpen size={20} /></div>
          <div><h4>{t('teacher.progressReports')}</h4><p>{t('teacher.progressReportsDesc')}</p></div>
        </Link>
      </div>

      {/* My Classes table */}
      <div className="chart-card">
        <h3>{t('teacher.myClasses')}</h3>
        {myClasses.length === 0 ? <div className="empty">{t('teacher.noClasses')}</div> : (
          <table>
            <thead><tr><th>{t('teacher.class')}</th><th>{t('admin.students')}</th><th>{t('teacher.attendance')}</th></tr></thead>
            <tbody>{myClasses.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{c.student_count}</td>
                <td>{c.attendance_done ? <span className="badge badge-success">{t('teacher.done')}</span> : c.student_count > 0 ? <span className="badge badge-warning">{t('teacher.pending')}</span> : <span className="helper">{t('teacher.noStudents')}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
