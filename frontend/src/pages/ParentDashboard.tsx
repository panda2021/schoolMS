import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { CalendarCheck, MessageCircle, BookOpen, Bell } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageProvider'

interface Child {
  student_id: string
  first_name: string
  last_name: string
  class_name: string | null
  attendance_status: string | null
}

interface UpdatePreview {
  id: string
  text_content: string
  created_at: string
  class_name: string
  expanded: boolean
  media_url: string | null
}

interface AnnouncementPreview {
  id: string
  title: string
  body: string | null
  class_name: string | null
  created_at: string
  is_new: boolean
  media_url: string | null
}

interface ProgressPreview {
  id: string
  student_name: string
  term_label: string
  summary: string | null
  metrics: Record<string, number> | null
  media_url: string | null
}

export default function ParentDashboard() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [children, setChildren] = useState<Child[]>([])
  const [recentUpdates, setRecentUpdates] = useState<UpdatePreview[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementPreview[]>([])
  const [progressReports, setProgressReports] = useState<ProgressPreview[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [mediaGallery, setMediaGallery] = useState<{ url: string; name: string }[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: p } = await supabase.from('parents').select('id').eq('user_id', user.id).maybeSingle()
      if (!p?.id) { setLoading(false); return }

      const today = new Date().toISOString().split('T')[0]
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      // Get children with class info
      const { data: psData } = await supabase
        .from('parent_students')
        .select('students(id, first_name, last_name, enrollments(classes(id, name)))')
        .eq('parent_id', p.id)

      const childList: Child[] = []
      const childIds: string[] = []
      const classIds: string[] = []

      for (const ps of psData ?? []) {
        const s = (ps as any).students
        if (!s) continue
        childIds.push(s.id)
        const className = s.enrollments?.[0]?.classes?.name ?? null
        if (s.enrollments) {
          for (const e of s.enrollments) {
            if (e.classes?.id) classIds.push(e.classes.id)
          }
        }
        childList.push({
          student_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          class_name: className,
          attendance_status: null,
        })
      }

      // Today's attendance
      if (childIds.length > 0) {
        const { data: attData } = await supabase
          .from('attendance')
          .select('student_id, status')
          .eq('date', today)
          .in('student_id', childIds)

        for (const att of attData ?? []) {
          const child = childList.find(c => c.student_id === att.student_id)
          if (child) child.attendance_status = att.status
        }
      }

      setChildren(childList)

      // Unread message count (messages in last 24h not from me)
      const { count: msgCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', p.id)
        .neq('sender_id', user.id)
        .gte('created_at', twentyFourHoursAgo)
      setUnreadCount(msgCount ?? 0)

      // Recent updates from children's classes
      if (classIds.length > 0) {
        const { data: updates } = await supabase
          .from('daily_updates')
          .select('id, text_content, created_at, classes(name)')
          .in('class_id', classIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(5)

        const updateList = (updates ?? []).map((u: any) => ({
          id: u.id,
          text_content: u.text_content ?? '',
          created_at: u.created_at,
          class_name: u.classes?.name ?? '-',
          expanded: false,
          media_url: null as string | null,
        }))

        // Load media for these updates
        if (updateList.length > 0) {
          const updateIds = updateList.map(u => u.id)
          const { data: media } = await supabase
            .from('media_assets')
            .select('daily_update_id, object_path')
            .in('daily_update_id', updateIds)

          const gallery: { url: string; name: string }[] = []
          for (const m of media ?? []) {
            const { data: signed } = await supabase.storage.from('media').createSignedUrl((m as any).object_path, 3600)
            if (signed) {
              const u = updateList.find(up => up.id === (m as any).daily_update_id)
              if (u) u.media_url = signed.signedUrl
              gallery.push({ url: signed.signedUrl, name: ((m as any).object_path as string).split('/').pop() || 'Photo' })
            }
          }
          setMediaGallery(gallery.slice(0, 4))
        }

        setRecentUpdates(updateList)
      }

      // Latest progress reports for my children
      if (childIds.length > 0) {
        const { data: reports } = await supabase
          .from('progress_reports')
          .select('id, student_id, term_label, summary, metrics, students(first_name, last_name)')
          .in('student_id', childIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(4)

        const reportList: ProgressPreview[] = (reports ?? []).map((r: any) => ({
          id: r.id,
          student_name: r.students ? `${r.students.first_name} ${r.students.last_name}` : 'Unknown',
          term_label: r.term_label,
          summary: r.summary,
          metrics: r.metrics,
          media_url: null,
        }))

        // Load media for reports
        const reportIds = reportList.map(r => r.id)
        if (reportIds.length > 0) {
          const { data: reportMedia } = await supabase
            .from('media_assets')
            .select('progress_report_id, object_path')
            .in('progress_report_id', reportIds)
            .is('deleted_at', null)
          for (const m of reportMedia ?? []) {
            const { data: signed } = await supabase.storage.from('media').createSignedUrl(m.object_path, 3600)
            if (signed && m.progress_report_id) {
              const rpt = reportList.find(r => r.id === m.progress_report_id)
              if (rpt) rpt.media_url = signed.signedUrl
            }
          }
        }

        setProgressReports(reportList)
      }

      // Announcements (with body)
      const { data: me } = await supabase.from('users').select('school_id').eq('id', user.id).maybeSingle()
      if (me?.school_id) {
        const { data: annData } = await supabase
          .from('announcements')
          .select('id, title, body, created_at, classes(name)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(3)
        const annList: AnnouncementPreview[] = (annData ?? []).map((a: any) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          class_name: a.classes?.name ?? null,
          created_at: a.created_at,
          is_new: new Date(a.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000,
          media_url: null,
        }))

        // Load media for announcements
        const annIds = annList.map(a => a.id)
        if (annIds.length > 0) {
          const { data: annMedia } = await supabase
            .from('media_assets')
            .select('announcement_id, object_path')
            .in('announcement_id', annIds)
            .is('deleted_at', null)
          for (const m of annMedia ?? []) {
            const { data: signed } = await supabase.storage.from('media').createSignedUrl(m.object_path, 3600)
            if (signed && m.announcement_id) {
              const ann = annList.find(a => a.id === m.announcement_id)
              if (ann) ann.media_url = signed.signedUrl
            }
          }
        }

        setAnnouncements(annList)
      }

      setLoading(false)
    }
    load()
  }, [])

  const toggleExpand = (id: string) => {
    setRecentUpdates(prev => prev.map(u => u.id === id ? { ...u, expanded: !u.expanded } : u))
  }

  const statusBadge = (status: string | null) => {
    if (!status) return <span className="badge">{t('parent.notRecorded')}</span>
    if (status === 'present') return <span className="badge badge-success">{t('parent.present')}</span>
    if (status === 'absent') return <span className="badge" style={{ color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca' }}>{t('parent.absent')}</span>
    if (status === 'late') return <span className="badge badge-warning">{t('parent.late')}</span>
    return <span className="badge">{status}</span>
  }

  const metricColor = (val: number) => {
    if (val >= 4) return 'badge-success'
    if (val >= 3) return 'badge-info'
    if (val >= 2) return 'badge-warning'
    return 'badge-danger'
  }

  if (loading) return (
    <div>
      <div className="dash-header"><div className="skeleton" style={{ height: 22, width: 200 }} /></div>
      <div className="stat-grid cols-3">{[1,2,3].map(i => <div key={i} className="stat-card"><div className="skeleton" style={{ height: 48 }} /></div>)}</div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="dash-header">
        <h2>{t('parent.title')}</h2>
        <p>{t('parent.subtitle')}</p>
      </div>

      {/* My Children */}
      <div className="chart-card">
        <h3>{t('parent.myChildren')}</h3>
        {children.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>{t('parent.noChildren')}</div>
        ) : (
          <div className="grid cols-2" style={{ gap: 10 }}>
            {children.map(c => (
              <div key={c.student_id} className="card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{c.first_name} {c.last_name}</div>
                <div className="helper" style={{ marginTop: 4 }}>{c.class_name ?? t('parent.notEnrolled')}</div>
                <div style={{ marginTop: 8 }}>
                  <span className="helper" style={{ marginRight: 8 }}>{t('parent.today')}:</span>
                  {statusBadge(c.attendance_status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid cols-3 quick-actions">
        <Link to="/app/attendance" className="quick-action">
          <div className="quick-action-icon" style={{ background: '#1d9e55' }}><CalendarCheck size={20} /></div>
          <div><h4>{t('parent.viewAttendance')}</h4><p>{t('parent.viewAttendanceDesc')}</p></div>
        </Link>
        <Link to="/app/messages" className="quick-action" style={{ position: 'relative' }}>
          <div className="quick-action-icon" style={{ background: '#1a8a7a' }}><MessageCircle size={20} /></div>
          <div><h4>{t('parent.viewMessages')}</h4><p>{t('parent.viewMessagesDesc')}</p></div>
          {unreadCount > 0 && (
            <span className="badge badge-warning" style={{ position: 'absolute', top: 8, right: 8, fontSize: 11 }}>
              {unreadCount} new
            </span>
          )}
        </Link>
        <Link to="/app/reports" className="quick-action">
          <div className="quick-action-icon" style={{ background: '#1a3a4a' }}><BookOpen size={20} /></div>
          <div><h4>{t('parent.viewReports')}</h4><p>{t('parent.viewReportsDesc')}</p></div>
        </Link>
      </div>

      {/* Media Gallery */}
      {mediaGallery.length > 0 && (
        <div className="card">
          <h3 >{t('parent.recentPhotos')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {mediaGallery.map((m, i) => (
              <div key={i} style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '1', border: '1px solid var(--border)' }}>
                <img
                  src={m.url}
                  alt={m.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Link to="/app/updates" style={{ color: 'var(--primary)', fontSize: 14 }}>{t('parent.viewAllUpdates')}</Link>
          </div>
        </div>
      )}

      {/* Progress Reports */}
      {progressReports.length > 0 && (
        <div className="card">
          <h3 >{t('parent.latestReports')}</h3>
          <div className="grid cols-2" style={{ gap: 10 }}>
            {progressReports.map(r => (
              <div key={r.id} className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 500 }}>{r.student_name}</div>
                <div className="helper" style={{ fontSize: 12 }}>{r.term_label}</div>
                {r.summary && <p style={{ fontSize: 13, margin: '6px 0 0 0', color: 'var(--muted)' }}>{r.summary}</p>}
                {r.metrics && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {Object.entries(r.metrics).map(([key, val]) => (
                      <span key={key} className={`badge ${metricColor(val as number)}`} style={{ fontSize: 11 }}>
                        {key}: {val}/5
                      </span>
                    ))}
                  </div>
                )}
                {r.media_url && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={r.media_url}
                      alt="Report attachment"
                      style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }}
                      onClick={() => window.open(r.media_url!, '_blank')}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Link to="/app/reports" style={{ color: 'var(--primary)', fontSize: 14 }}>{t('parent.viewAllReports')}</Link>
          </div>
        </div>
      )}

      {/* Recent Updates */}
      {recentUpdates.length > 0 && (
        <div className="card">
          <h3 >{t('parent.recentUpdates')}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {recentUpdates.map(u => (
              <li key={u.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge" style={{ marginRight: 8 }}>{u.class_name}</span>
                  <span className="helper">{new Date(u.created_at).toLocaleDateString()}</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: 14 }}>
                  {u.expanded || u.text_content.length <= 100
                    ? u.text_content
                    : u.text_content.slice(0, 100) + '...'}
                </p>
                {u.text_content.length > 100 && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: 0, fontSize: 13, color: 'var(--primary)', marginTop: 2 }}
                    onClick={() => toggleExpand(u.id)}
                  >
                    {u.expanded ? t('parent.showLess') : t('parent.readMore')}
                  </button>
                )}
                {u.media_url && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={u.media_url}
                      alt="Update media"
                      style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid var(--border)' }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 8 }}>
            <Link to="/app/updates" style={{ color: 'var(--primary)', fontSize: 14 }}>{t('parent.viewAllUpdates')}</Link>
          </div>
        </div>
      )}

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="card">
          <h3 >{t('parent.latestAnnouncements')}</h3>
          {announcements.map(a => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>{a.title}</span>
                {a.is_new && <span className="badge badge-warning" style={{ fontSize: 10 }}>{t('parent.new')}</span>}
                {a.class_name && <span className="badge badge-info" style={{ fontSize: 10 }}>{a.class_name}</span>}
              </div>
              {a.body && (
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
                  {a.body.length > 150 ? a.body.slice(0, 150) + '...' : a.body}
                </p>
              )}
              {a.media_url && (
                <div style={{ marginTop: 6 }}>
                  <img
                    src={a.media_url}
                    alt="Attachment"
                    style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 8, border: '1px solid var(--border)' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}
              <div className="helper" style={{ fontSize: 11, marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString()}</div>
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <Link to="/app/announcements" style={{ color: 'var(--primary)', fontSize: 14 }}>{t('parent.viewAllAnnouncements')}</Link>
          </div>
        </div>
      )}
    </div>
  )
}
