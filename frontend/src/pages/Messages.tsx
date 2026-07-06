import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { ParentMultiSelect } from '@/ui/components/ParentMultiSelect'
import { Modal } from '@/ui/components/Modal'
import { useLanguage } from '@/i18n/LanguageProvider'
import { Paperclip, Send, X } from 'lucide-react'

interface Conversation {
  parent_id: string
  teacher_id: string | null
  student_id: string | null
  other_name: string
  student_name: string
  last_message: string
  last_at: string
  is_admin_convo: boolean
}

interface Message {
  id: string
  text_content: string
  sender_id: string
  created_at: string
}

type Role = 'teacher' | 'parent' | 'school_admin'

export default function Messages() {
  const { show } = useToast()
  const { t } = useLanguage()
  const [role, setRole] = useState<Role | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvo, setActiveConvo] = useState<{ parent_id: string; teacher_id: string | null; student_id: string | null } | null>(null)

  // Thread
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [messageMedia, setMessageMedia] = useState<Record<string, { url: string; name: string; mime: string }[]>>({})

  // New conversation
  const [showNewConvo, setShowNewConvo] = useState(false)
  const [convoTargets, setConvoTargets] = useState<{ id: string; name: string; student_name: string; student_id: string | null }[]>([])
  const [selectedTarget, setSelectedTarget] = useState('')

  // Bulk messaging (admin)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkParents, setBulkParents] = useState<string[]>([])
  const [bulkText, setBulkText] = useState('')
  const [bulkSending, setBulkSending] = useState(false)

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
      const r = (me?.role_key ?? null) as Role | null
      setRole(r)
      setSchoolId(me?.school_id ?? null)

      if (r === 'parent') {
        const { data: p } = await supabase.from('parents').select('id').eq('user_id', user.id).maybeSingle()
        setParentId(p?.id ?? null)
        if (p?.id) await loadConversations(r, p.id, null)
      } else if (r === 'teacher') {
        const { data: t } = await supabase.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
        setTeacherId(t?.id ?? null)
        if (t?.id) await loadConversations(r, null, t.id)
      } else if (r === 'school_admin') {
        await loadConversations(r, null, null)
      }

      setLoading(false)
    }
    init()
  }, [])

  const loadConversations = async (r: Role, pid: string | null, tid: string | null) => {
    let query = supabase
      .from('messages')
      .select('parent_id, teacher_id, student_id, text_content, created_at, sender_id, parents(users(full_name)), teachers(users(full_name)), students(first_name, last_name)')
      .order('created_at', { ascending: false })

    if (r === 'parent' && pid) query = query.eq('parent_id', pid)
    else if (r === 'teacher' && tid) query = query.eq('teacher_id', tid)

    const { data } = await query
    if (!data) return

    const convoMap = new Map<string, Conversation>()
    for (const msg of data as any[]) {
      const key = `${msg.parent_id}|${msg.teacher_id ?? 'admin'}|${msg.student_id ?? ''}`
      if (!convoMap.has(key)) {
        const isAdminConvo = msg.teacher_id === null
        let otherName: string
        if (r === 'parent') {
          otherName = isAdminConvo ? 'School Admin' : (msg.teachers?.users?.full_name ?? 'Teacher')
        } else if (r === 'school_admin') {
          otherName = isAdminConvo
            ? (msg.parents?.users?.full_name ?? 'Parent')
            : `${msg.parents?.users?.full_name ?? 'Parent'} \u2194 ${msg.teachers?.users?.full_name ?? 'Teacher'}`
        } else {
          otherName = msg.parents?.users?.full_name ?? 'Parent'
        }
        convoMap.set(key, {
          parent_id: msg.parent_id,
          teacher_id: msg.teacher_id,
          student_id: msg.student_id,
          other_name: otherName,
          student_name: msg.students ? `${msg.students.first_name} ${msg.students.last_name}` : '',
          last_message: msg.text_content,
          last_at: msg.created_at,
          is_admin_convo: isAdminConvo,
        })
      }
    }
    setConversations(Array.from(convoMap.values()))

    // Load targets for new conversation
    if (r === 'parent' && pid) {
      const { data: ps } = await supabase
        .from('parent_students')
        .select('students(id, first_name, last_name, enrollments(classes(teacher_id, teachers(id, users(full_name)))))')
        .eq('parent_id', pid)

      const targets: typeof convoTargets = []
      for (const row of ps ?? []) {
        const s = (row as any).students
        if (!s) continue
        for (const e of s.enrollments ?? []) {
          const t = e.classes?.teachers
          if (t) {
            targets.push({
              id: t.id,
              name: t.users?.full_name ?? 'Teacher',
              student_name: `${s.first_name} ${s.last_name}`,
              student_id: s.id,
            })
          }
        }
      }
      setConvoTargets(targets)
    } else if (r === 'teacher' && tid) {
      const { data: cls } = await supabase.from('classes').select('id').eq('teacher_id', tid).is('deleted_at', null)
      const classIds = (cls ?? []).map(c => c.id)
      if (classIds.length > 0) {
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('students(id, first_name, last_name, parent_students(parents(id, users(full_name))))')
          .in('class_id', classIds)
          .is('deleted_at', null)

        const targets: typeof convoTargets = []
        const seen = new Set<string>()
        for (const e of enrolls ?? []) {
          const s = (e as any).students
          if (!s) continue
          for (const ps of s.parent_students ?? []) {
            const p = ps.parents
            if (p) {
              const key = `${p.id}-${s.id}`
              if (!seen.has(key)) {
                seen.add(key)
                targets.push({
                  id: p.id,
                  name: p.users?.full_name ?? 'Parent',
                  student_name: `${s.first_name} ${s.last_name}`,
                  student_id: s.id,
                })
              }
            }
          }
        }
        setConvoTargets(targets)
      }
    } else if (r === 'school_admin') {
      // Admin can message any parent in the school
      const { data: allParents } = await supabase
        .from('parents')
        .select('id, users(full_name)')
        .is('deleted_at', null)

      const targets: typeof convoTargets = []
      for (const p of allParents ?? []) {
        targets.push({
          id: p.id,
          name: (p as any).users?.full_name ?? 'Parent',
          student_name: '',
          student_id: null,
        })
      }
      setConvoTargets(targets)
    }
  }

  const openThread = async (convo: { parent_id: string; teacher_id: string | null; student_id: string | null }) => {
    setActiveConvo(convo)
    setLoadingThread(true)
    setMessageMedia({})
    let query = supabase
      .from('messages')
      .select('id, text_content, sender_id, created_at')
      .eq('parent_id', convo.parent_id)
      .order('created_at', { ascending: true })

    // Handle null teacher_id (admin conversations) vs regular teacher conversations
    if (convo.teacher_id) {
      query = query.eq('teacher_id', convo.teacher_id)
    } else {
      query = query.is('teacher_id', null)
    }

    if (convo.student_id) query = query.eq('student_id', convo.student_id)
    else query = query.is('student_id', null)

    const { data } = await query
    setMessages(data ?? [])
    setLoadingThread(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

    // Load media attachments for messages
    const msgIds = (data ?? []).map(m => m.id)
    if (msgIds.length > 0) {
      const { data: media } = await supabase
        .from('media_assets')
        .select('message_id, object_path, mime_type')
        .in('message_id', msgIds)
        .is('deleted_at', null)

      const byMsg: Record<string, { url: string; name: string; mime: string }[]> = {}
      for (const m of media ?? []) {
        const { data: signed } = await supabase.storage.from('media').createSignedUrl(m.object_path, 3600)
        if (signed && m.message_id) {
          if (!byMsg[m.message_id]) byMsg[m.message_id] = []
          byMsg[m.message_id].push({
            url: signed.signedUrl,
            name: m.object_path.split('/').pop() || 'Attachment',
            mime: m.mime_type || '',
          })
        }
      }
      setMessageMedia(byMsg)
    }
  }

  const sendMessage = async () => {
    if ((!newMsg.trim() && !pendingFile) || !activeConvo || !userId || !schoolId) return
    setSending(true)
    const messageText = newMsg.trim() || (pendingFile ? `[attachment: ${pendingFile.name}]` : '')
    const { data, error } = await supabase.from('messages').insert({
      school_id: schoolId,
      parent_id: activeConvo.parent_id,
      teacher_id: activeConvo.teacher_id,
      student_id: activeConvo.student_id,
      sender_id: userId,
      text_content: messageText,
    }).select('id').single()
    if (error) { show(error.message, 'error'); setSending(false); return }
    setNewMsg('')

    if (pendingFile && data?.id) {
      let uploadedPath: string | null = null
      try {
        const safeName = pendingFile.name.replace(/[^\w.]+/g, '_')
        const path = `${schoolId}/messages/${userId}/${Date.now()}_${safeName}`
        const { error: upErr } = await supabase.storage.from('media').upload(path, pendingFile, {
          upsert: false,
          contentType: pendingFile.type || 'application/octet-stream',
        })
        if (upErr) throw upErr
        uploadedPath = path
        const { error: assetErr } = await supabase.from('media_assets').insert({
          bucket: 'media',
          object_path: path,
          school_id: schoolId,
          mime_type: pendingFile.type || 'application/octet-stream',
          file_size_bytes: pendingFile.size,
          uploaded_by: userId,
          message_id: data.id,
        })
        if (assetErr) throw assetErr
        show('Message and attachment sent', 'success')
      } catch (e: any) {
        // Don't leave an orphaned storage object if the DB row failed.
        if (uploadedPath) await supabase.storage.from('media').remove([uploadedPath])
        show('Message sent, but attachment failed: ' + (e.message || e), 'error')
      }
      setPendingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    await openThread(activeConvo)
    setSending(false)
  }

  const startNewConversation = () => {
    if (!selectedTarget) return

    if (role === 'school_admin') {
      // Admin starts direct conversation with parent (no teacher, no student)
      const target = convoTargets.find(t => t.id === selectedTarget)
      if (!target) return
      const convo = {
        parent_id: target.id,
        teacher_id: null,
        student_id: null,
      }
      setShowNewConvo(false)
      setSelectedTarget('')
      openThread(convo)
      return
    }

    const target = convoTargets.find(t => `${t.id}-${t.student_id}` === selectedTarget)
    if (!target) return

    const convo = {
      parent_id: role === 'parent' ? parentId! : target.id,
      teacher_id: role === 'teacher' ? teacherId! : target.id,
      student_id: target.student_id,
    }
    setShowNewConvo(false)
    setSelectedTarget('')
    openThread(convo)
  }

  // Admin can send in their own conversations (teacher_id is null) but is read-only on teacher-parent threads
  const canSendInActiveConvo = (): boolean => {
    if (!activeConvo) return false
    if (role === 'parent' || role === 'teacher') return true
    if (role === 'school_admin') return activeConvo.teacher_id === null
    return false
  }

  const sendBulkMessages = async () => {
    if (!bulkText.trim() || bulkParents.length === 0 || !schoolId || !userId) return
    setBulkSending(true)

    const rows = bulkParents.map(pid => ({
      school_id: schoolId,
      parent_id: pid,
      teacher_id: null,
      student_id: null,
      sender_id: userId,
      text_content: bulkText.trim(),
    }))

    const { error } = await supabase.from('messages').insert(rows)
    if (error) {
      show('Failed to send: ' + error.message, 'error')
    } else {
      show(`Message sent to ${bulkParents.length} parent${bulkParents.length !== 1 ? 's' : ''}`, 'success')
      setBulkText('')
      setBulkParents([])
      setShowBulkModal(false)
      await loadConversations(role!, null, null)
    }
    setBulkSending(false)
  }

  if (loading) return (
    <div className="card">
      <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 60, width: '100%', borderRadius: 8, marginTop: 12 }} />
    </div>
  )

  if (role !== 'parent' && role !== 'teacher' && role !== 'school_admin') {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('messages.title')}</h2>
        <p className="helper">{t('messages.notAvailable')}</p>
      </div>
    )
  }

  const convoKey = (c: { parent_id: string; teacher_id: string | null; student_id: string | null }) =>
    `${c.parent_id}|${c.teacher_id ?? 'admin'}|${c.student_id ?? ''}`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: activeConvo ? '300px 1fr' : '1fr', gap: 12, minHeight: 'calc(100vh - 120px)' }}>
      {/* Conversation list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', display: activeConvo ? undefined : 'block' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{t('messages.conversations')}</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {role === 'school_admin' && (
              <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setShowBulkModal(true)}>
                {t('messages.bulk')}
              </button>
            )}
            {convoTargets.length > 0 && (
              <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setShowNewConvo(!showNewConvo)}>
                {t('messages.new')}
              </button>
            )}
          </div>
        </div>

        {showNewConvo && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <select value={selectedTarget} onChange={e => setSelectedTarget(e.target.value)} style={{ padding: '6px 8px', fontSize: 13, width: '100%' }}>
              <option value="">
                {role === 'school_admin' ? t('messages.selectParent') : role === 'parent' ? t('messages.selectTeacher') : t('messages.selectParent')}
              </option>
              {convoTargets.map(ct => (
                <option
                  key={role === 'school_admin' ? ct.id : `${ct.id}-${ct.student_id}`}
                  value={role === 'school_admin' ? ct.id : `${ct.id}-${ct.student_id}`}
                >
                  {ct.name}{ct.student_name ? ` (re: ${ct.student_name})` : ''}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13, marginTop: 6 }} onClick={startNewConversation} disabled={!selectedTarget}>
              {t('messages.startChat')}
            </button>
          </div>
        )}

        {conversations.length === 0 && !showNewConvo ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
            {t('messages.noConversations')}{convoTargets.length > 0 && ' Click + New to start one.'}
          </div>
        ) : (
          <div>
            {conversations.map(c => {
              const key = convoKey(c)
              const isActive = activeConvo && convoKey(activeConvo) === key
              return (
                <div
                  key={key}
                  onClick={() => openThread(c)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: isActive ? 'rgba(37,99,235,0.08)' : undefined,
                  }}
                >
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.other_name}
                    {c.is_admin_convo && role === 'school_admin' && (
                      <span className="badge badge-info" style={{ fontSize: 10 }}>{t('messages.direct')}</span>
                    )}
                    {c.is_admin_convo && role === 'parent' && (
                      <span className="badge badge-info" style={{ fontSize: 10 }}>{t('messages.admin')}</span>
                    )}
                    {!c.is_admin_convo && role === 'school_admin' && (
                      <span className="badge" style={{ fontSize: 10 }}>{t('messages.viewOnly')}</span>
                    )}
                  </div>
                  {c.student_name && <div className="helper" style={{ fontSize: 11 }}>re: {c.student_name}</div>}
                  <div className="helper" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.last_message}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Thread */}
      {activeConvo && (
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>
                {conversations.find(c => convoKey(c) === convoKey(activeConvo))?.other_name ?? 'Chat'}
              </strong>
              <span className="helper" style={{ marginLeft: 8 }}>
                {conversations.find(c => convoKey(c) === convoKey(activeConvo))?.student_name}
              </span>
            </div>
            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13 }} onClick={() => setActiveConvo(null)}>{t('common.close')}</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 300 }}>
            {loadingThread ? (
              <div style={{ textAlign: 'center', padding: 24 }}><LoadingSpinner size="md" /></div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>{t('messages.noMessages')}</div>
            ) : (
              messages.map(m => {
                const isMine = m.sender_id === userId
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%',
                      padding: '8px 12px',
                      borderRadius: 12,
                      background: isMine ? 'var(--primary)' : 'var(--bg)',
                      color: isMine ? '#fff' : 'var(--text)',
                      border: isMine ? 'none' : '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 14 }}>{m.text_content}</div>
                      {messageMedia[m.id]?.map((att, i) => (
                        <div key={i} style={{ marginTop: 6 }}>
                          {att.mime.startsWith('image/') ? (
                            <img
                              src={att.url}
                              alt={att.name}
                              style={{ maxWidth: 200, maxHeight: 160, borderRadius: 8, cursor: 'pointer', display: 'block' }}
                              onClick={() => window.open(att.url, '_blank')}
                            />
                          ) : (
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: isMine ? '#dbeafe' : 'var(--primary)', fontSize: 13, textDecoration: 'underline' }}
                            >
                              {att.name}
                            </a>
                          )}
                        </div>
                      ))}
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, textAlign: 'right' }}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {canSendInActiveConvo() ? (
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              {pendingFile && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', marginBottom: 6,
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                  fontSize: 13,
                }}>
                  <Paperclip size={14} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pendingFile.name} ({(pendingFile.size / 1024).toFixed(0)} KB)
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    style={{ padding: 2 }}
                    aria-label="Remove attachment"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 50 * 1024 * 1024) { show('File too large (max 50MB)', 'error'); return }
                    setPendingFile(f)
                  }}
                />
                <button
                  className="btn btn-ghost"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ padding: 8 }}
                  disabled={sending}
                  aria-label="Attach file"
                  title="Attach a file"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder={t('messages.placeholder')}
                  style={{ flex: 1, padding: '8px 12px' }}
                />
                <button
                  className="btn btn-primary"
                  onClick={sendMessage}
                  disabled={sending || (!newMsg.trim() && !pendingFile)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  aria-label={t('messages.send')}
                >
                  {sending ? <LoadingSpinner size="sm" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <span className="helper">{t('messages.readOnly')}</span>
            </div>
          )}
        </div>
      )}
      {/* Bulk message modal (admin only) */}
      {showBulkModal && schoolId && (
        <Modal open={showBulkModal} onClose={() => setShowBulkModal(false)} title={t('messages.bulkTitle')} wide>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label className="helper" style={{ marginBottom: 6, display: 'block' }}>{t('messages.bulkSelectParents')}</label>
              <ParentMultiSelect
                schoolId={schoolId}
                selectedParentIds={bulkParents}
                onChange={setBulkParents}
              />
            </div>
            <div>
              <label className="helper" style={{ marginBottom: 6, display: 'block' }}>{t('messages.bulkMessage')}</label>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                rows={4}
                placeholder={t('messages.bulkPlaceholder')}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={sendBulkMessages}
                disabled={bulkSending || !bulkText.trim() || bulkParents.length === 0}
              >
                {bulkSending ? <><LoadingSpinner size="sm" /> Sending...</> : `Send to ${bulkParents.length} parent${bulkParents.length !== 1 ? 's' : ''}`}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
