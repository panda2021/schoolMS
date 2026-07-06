import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { useFeature } from '@/ui/features/FeatureProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { FileUpload } from '@/ui/components/FileUpload'
import { ParentMultiSelect } from '@/ui/components/ParentMultiSelect'
import { useLanguage } from '@/i18n/LanguageProvider'

interface ClassOption { id: string; name: string }
interface Announcement {
  id: string
  title: string
  body: string | null
  class_name: string | null
  author_name: string | null
  created_by: string
  created_at: string
  targeted_count: number
  media_url: string | null
  media_name: string | null
}

type Role = 'teacher' | 'parent' | 'school_admin'
type AudienceType = 'school' | 'class' | 'targeted'

const PAGE_SIZE = 10

export default function Announcements() {
  const { t } = useLanguage()
  const { show } = useToast()
  const { can } = useFeature()
  const [role, setRole] = useState<Role | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formClass, setFormClass] = useState('')
  const [audienceType, setAudienceType] = useState<AudienceType>('school')
  const [targetedParents, setTargetedParents] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [lastAnnouncementId, setLastAnnouncementId] = useState<string | null>(null)

  const canPost = (role === 'school_admin' || role === 'teacher') && can('announcements.post')

  const loadAnnouncements = async (p: number) => {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, body, created_by, created_at, classes(name), users(full_name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) { show(error.message, 'error'); return }

    const ids = (data ?? []).map((a: any) => a.id)

    // Load recipient counts for targeted announcements
    let recipientCounts: Record<string, number> = {}
    if (ids.length > 0 && canPost) {
      const { data: recipients } = await supabase
        .from('announcement_recipients')
        .select('announcement_id')
        .in('announcement_id', ids)
      if (recipients) {
        for (const r of recipients) {
          recipientCounts[r.announcement_id] = (recipientCounts[r.announcement_id] || 0) + 1
        }
      }
    }

    // Load media for announcements
    let mediaByAnnouncement: Record<string, { url: string; name: string }> = {}
    if (ids.length > 0) {
      const { data: media } = await supabase
        .from('media_assets')
        .select('announcement_id, object_path')
        .in('announcement_id', ids)
      if (media) {
        for (const m of media as any[]) {
          if (!m.announcement_id || mediaByAnnouncement[m.announcement_id]) continue
          const { data: signed } = await supabase.storage
            .from('media')
            .createSignedUrl(m.object_path, 3600)
          if (signed) {
            mediaByAnnouncement[m.announcement_id] = { url: signed.signedUrl, name: (m.object_path as string).split('/').pop() || 'Attachment' }
          }
        }
      }
    }

    const mapped: Announcement[] = (data ?? []).map((a: any) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      class_name: a.classes?.name ?? null,
      author_name: a.users?.full_name ?? null,
      created_by: a.created_by,
      created_at: a.created_at,
      targeted_count: recipientCounts[a.id] || 0,
      media_url: mediaByAnnouncement[a.id]?.url ?? null,
      media_name: mediaByAnnouncement[a.id]?.name ?? null,
    }))
    setAnnouncements(mapped)
    setHasMore(mapped.length === PAGE_SIZE)
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
      setRole((me?.role_key ?? null) as Role | null)
      setSchoolId(me?.school_id ?? null)

      if (me?.role_key === 'school_admin' || me?.role_key === 'teacher') {
        const { data: cls } = await supabase
          .from('classes')
          .select('id, name')
          .is('deleted_at', null)
          .order('name')
        setClasses(cls ?? [])
      }

      await loadAnnouncements(0)
      setLoading(false)
    }
    init()
  }, [])

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      show('Please enter a title.', 'error'); return
    }
    if (!userId) {
      show('Not signed in. Please sign in again.', 'error'); return
    }
    if (!schoolId) {
      show('Your account is not linked to a school yet. Ask the super admin to link you.', 'error'); return
    }
    if (audienceType === 'targeted' && targetedParents.length === 0) {
      show('Select at least one parent for targeted announcement', 'error')
      return
    }
    if (audienceType === 'class' && !formClass) {
      show('Select a class.', 'error'); return
    }
    setSaving(true)

    const insertPayload = {
      school_id: schoolId,
      title: formTitle.trim(),
      body: formBody.trim() || null,
      class_id: audienceType === 'class' ? formClass : null,
      created_by: userId,
    }
    console.log('[Announcements] Inserting:', insertPayload)

    const { data: ann, error } = await supabase.from('announcements').insert(insertPayload).select('id').single()

    if (error) {
      console.error('[Announcements] insert error:', error)
      show(`Could not post: ${error.message}`, 'error')
      setSaving(false)
      return
    }

    // Insert targeted recipients if applicable
    if (audienceType === 'targeted' && targetedParents.length > 0 && ann) {
      const rows = targetedParents.map(pid => ({
        announcement_id: ann.id,
        parent_id: pid,
      }))
      const { error: recErr } = await supabase.from('announcement_recipients').insert(rows)
      if (recErr) {
        // A targeted announcement with no recipient rows would be visible
        // school-wide. Roll it back (soft-delete) and report, rather than
        // silently over-sharing.
        await supabase.from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', ann.id)
        show('Could not set recipients, so the announcement was not posted: ' + recErr.message, 'error')
        setSaving(false)
        return
      }
    }

    show('Announcement posted', 'success')
    setLastAnnouncementId(ann?.id ?? null)
    setFormTitle(''); setFormBody(''); setFormClass(''); setAudienceType('school'); setTargetedParents([])
    setShowCreate(false)
    setPage(0)
    await loadAnnouncements(0)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this announcement?')) return
    const { error } = await supabase.from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { show(error.message, 'error') }
    else {
      show('Announcement deleted', 'success')
      await loadAnnouncements(page)
    }
  }

  const changePage = async (newPage: number) => {
    setPage(newPage)
    await loadAnnouncements(newPage)
  }

  if (loading) return (
    <div className="card">
      <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 60, width: '100%', borderRadius: 8, marginTop: 12 }} />
      <div className="skeleton" style={{ height: 60, width: '100%', borderRadius: 8, marginTop: 8 }} />
    </div>
  )

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('announcements.title')}</h2>
          {canPost && !showCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('announcements.new')}</button>
          )}
        </div>

        {/* Create form */}
        {showCreate && canPost && (
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>{t('announcements.post')}</h4>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="helper">{t('announcements.titleLabel')}</label>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder={t('announcements.titlePlaceholder')} />
              </div>
              <div>
                <label className="helper">{t('announcements.body')}</label>
                <textarea value={formBody} onChange={e => setFormBody(e.target.value)} rows={3} placeholder={t('announcements.bodyPlaceholder')} />
              </div>
              <div>
                <label className="helper">{t('announcements.audience')}</label>
                <div className="tab-bar" style={{ marginBottom: 8 }}>
                  <button className={`tab-btn${audienceType === 'school' ? ' active' : ''}`} onClick={() => setAudienceType('school')}>{t('announcements.allSchool')}</button>
                  <button className={`tab-btn${audienceType === 'class' ? ' active' : ''}`} onClick={() => setAudienceType('class')}>{t('announcements.byClass')}</button>
                  <button className={`tab-btn${audienceType === 'targeted' ? ' active' : ''}`} onClick={() => setAudienceType('targeted')}>{t('announcements.specificParents')}</button>
                </div>
                {audienceType === 'class' && (
                  <select value={formClass} onChange={e => setFormClass(e.target.value)}>
                    <option value="">{t('announcements.selectClass')}</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {audienceType === 'targeted' && schoolId && (
                  <ParentMultiSelect
                    schoolId={schoolId}
                    selectedParentIds={targetedParents}
                    onChange={setTargetedParents}
                  />
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !formTitle.trim()}>
                {saving ? <><LoadingSpinner size="sm" /> {t('common.posting')}</> : t('announcements.postBtn')}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setAudienceType('school'); setTargetedParents([]) }}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Attach media to last announcement */}
        {lastAnnouncementId && schoolId && userId && (
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg)', padding: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>{t('announcements.attach')}</label>
            <FileUpload
              schoolId={schoolId}
              uploadedBy={userId}
              folder="announcements"
              associationField="announcement_id"
              associationId={lastAnnouncementId}
              onUploadComplete={() => { show('File attached', 'success'); setLastAnnouncementId(null); loadAnnouncements(page) }}
              onError={(msg) => show(msg, 'error')}
              compact
            />
            <button className="btn btn-ghost" style={{ marginTop: 6, fontSize: 12 }} onClick={() => setLastAnnouncementId(null)}>{t('announcements.skip')}</button>
          </div>
        )}

        {/* Feed */}
        {announcements.length === 0 ? (
          <div className="empty">{t('announcements.noAnnouncements')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {announcements.map(a => (
              <div key={a.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: 0 }}>{a.title}</h4>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {a.targeted_count > 0 ? (
                        <span className="badge badge-warning">{a.targeted_count} parent{a.targeted_count !== 1 ? 's' : ''}</span>
                      ) : (
                        <span className={a.class_name ? 'badge badge-info' : 'badge badge-success'}>
                          {a.class_name ?? t('announcements.schoolWide')}
                        </span>
                      )}
                      {a.author_name && <span className="helper">by {a.author_name}</span>}
                      <span className="helper">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {(a.created_by === userId || (role === 'school_admin' && can('announcements.delete'))) && (
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13, color: '#dc2626' }} onClick={() => handleDelete(a.id)}>{t('common.delete')}</button>
                  )}
                </div>
                {a.body && <p style={{ margin: '8px 0 0 0', color: 'var(--text)' }}>{a.body}</p>}
                {a.media_url && (
                  <div style={{ marginTop: 10 }}>
                    <img
                      src={a.media_url}
                      alt={a.media_name ?? 'Attachment'}
                      style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, border: '1px solid var(--border)' }}
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement
                        el.style.display = 'none'
                        const link = document.createElement('a')
                        link.href = a.media_url!
                        link.target = '_blank'
                        link.rel = 'noopener noreferrer'
                        link.textContent = a.media_name ?? 'View attachment'
                        link.style.color = 'var(--primary)'
                        link.style.fontSize = '13px'
                        el.parentNode?.appendChild(link)
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {(page > 0 || hasMore) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            {page > 0 && <button className="btn btn-secondary" onClick={() => changePage(page - 1)}>{t('announcements.prev')}</button>}
            {hasMore && <button className="btn btn-secondary" onClick={() => changePage(page + 1)}>{t('announcements.next')}</button>}
          </div>
        )}
      </div>
    </div>
  )
}
