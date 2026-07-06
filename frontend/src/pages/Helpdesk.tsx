import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { Paperclip, Send, X, ShieldCheck } from 'lucide-react'

const CATEGORIES = [
  { key: 'login', label: 'Login / sign-in issue' },
  { key: 'attendance', label: 'Cannot save attendance' },
  { key: 'upload', label: 'File upload / attachment fails' },
  { key: 'missing-data', label: 'Missing student, class, or teacher' },
  { key: 'grades', label: 'Grade entry blocked or incorrect' },
  { key: 'announcements', label: 'Announcement error or not visible' },
  { key: 'messaging', label: 'Messaging / chat issue' },
  { key: 'updates', label: 'Daily updates not loading' },
  { key: 'reports', label: 'Reports or report card issue' },
  { key: 'subscription', label: 'Subscription / billing' },
  { key: 'feature-request', label: 'Feature request' },
  { key: 'other', label: 'Other (please describe)' },
]

const PRIVACY_NOTE = 'Conversations in this helpdesk are reviewed only by the Abogida system development team for quality assurance. We are not affiliated with any school or institution — we only build and maintain the platform. Please do not include sensitive student information.'

interface Ticket {
  id: string
  subject: string
  category: string
  status: string
  created_at: string
  user_id: string
  school_id: string | null
  user_name?: string
  school_name?: string
}

interface TicketMessage {
  id: string
  ticket_id: string
  sender_id: string
  is_staff_reply: boolean
  body: string
  created_at: string
  sender_name?: string
}

interface Attachment {
  url: string
  name: string
  mime: string
}

export default function Helpdesk() {
  const { show } = useToast()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const [thread, setThread] = useState<TicketMessage[]>([])
  const [attachmentsByMsg, setAttachmentsByMsg] = useState<Record<string, Attachment[]>>({})

  // New-ticket form
  const [showNew, setShowNew] = useState(false)
  const [acceptedNotice, setAcceptedNotice] = useState(false)
  const [category, setCategory] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reply
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const init = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
    setRole(me?.role_key ?? null)
    setSchoolId(me?.school_id ?? null)
    await loadTickets(me?.role_key === 'super_admin')
    setLoading(false)
  }

  const loadTickets = async (isSuper: boolean) => {
    let q = supabase
      .from('helpdesk_tickets')
      .select('id, subject, category, status, created_at, user_id, school_id, users(full_name), schools(name)')
      .order('created_at', { ascending: false })
      .limit(100)

    const { data, error } = await q
    if (error) { show(error.message, 'error'); return }
    setTickets((data ?? []).map((t: any) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      created_at: t.created_at,
      user_id: t.user_id,
      school_id: t.school_id,
      user_name: t.users?.full_name,
      school_name: t.schools?.name,
    })))
    void isSuper
  }

  useEffect(() => { init() }, [])

  const openTicket = async (t: Ticket) => {
    setActiveTicket(t)
    setThread([])
    setAttachmentsByMsg({})
    const { data } = await supabase
      .from('helpdesk_messages')
      .select('id, ticket_id, sender_id, is_staff_reply, body, created_at, users(full_name)')
      .eq('ticket_id', t.id)
      .order('created_at', { ascending: true })
    const msgs: TicketMessage[] = (data ?? []).map((m: any) => ({
      id: m.id,
      ticket_id: m.ticket_id,
      sender_id: m.sender_id,
      is_staff_reply: m.is_staff_reply,
      body: m.body,
      created_at: m.created_at,
      sender_name: m.users?.full_name ?? (m.is_staff_reply ? 'Support' : 'You'),
    }))
    setThread(msgs)

    const ids = msgs.map(m => m.id)
    if (ids.length) {
      const { data: media } = await supabase
        .from('media_assets')
        .select('helpdesk_message_id, object_path, mime_type')
        .in('helpdesk_message_id', ids)
      const byMsg: Record<string, Attachment[]> = {}
      for (const m of media ?? []) {
        if (!m.helpdesk_message_id) continue
        const { data: signed } = await supabase.storage.from('media').createSignedUrl(m.object_path, 3600)
        if (signed) {
          (byMsg[m.helpdesk_message_id] ||= []).push({
            url: signed.signedUrl,
            name: (m.object_path as string).split('/').pop() || 'Attachment',
            mime: m.mime_type || '',
          })
        }
      }
      setAttachmentsByMsg(byMsg)
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  const submitTicket = async () => {
    if (!acceptedNotice) { show('Please confirm the privacy notice first.', 'error'); return }
    if (!category) { show('Choose a category.', 'error'); return }
    if (!subject.trim() || !body.trim()) { show('Fill in subject and description.', 'error'); return }
    if (!userId || !role) return
    setSubmitting(true)
    const { data: t, error } = await supabase.from('helpdesk_tickets').insert({
      school_id: schoolId,
      user_id: userId,
      role_at_creation: role,
      category,
      subject: subject.trim(),
      body: body.trim(),
    }).select('id').single()
    if (error) { show(error.message, 'error'); setSubmitting(false); return }

    // first ticket message = the body
    await supabase.from('helpdesk_messages').insert({
      ticket_id: t!.id,
      sender_id: userId,
      is_staff_reply: false,
      body: body.trim(),
    })

    show('Ticket submitted. The Abogida team will respond as soon as possible.', 'success')
    setShowNew(false); setSubject(''); setBody(''); setCategory(''); setAcceptedNotice(false)
    await loadTickets(role === 'super_admin')
    setSubmitting(false)
  }

  const sendReply = async () => {
    if ((!reply.trim() && !pendingFile) || !activeTicket || !userId || !role) return
    setSending(true)
    const text = reply.trim() || (pendingFile ? `[attachment: ${pendingFile.name}]` : '')
    const { data: m, error } = await supabase.from('helpdesk_messages').insert({
      ticket_id: activeTicket.id,
      sender_id: userId,
      is_staff_reply: role === 'super_admin',
      body: text,
    }).select('id').single()
    if (error) { show(error.message, 'error'); setSending(false); return }
    setReply('')

    // Attachments live under the TICKET's school, not the sender's — super_admin
    // support staff have no school_id of their own.
    const ticketSchool = activeTicket.school_id
    if (pendingFile && m?.id) {
      let uploadedPath: string | null = null
      try {
        if (!ticketSchool) throw new Error('Ticket has no school context')
        const safeName = pendingFile.name.replace(/[^\w.]+/g, '_')
        const path = `${ticketSchool}/helpdesk/${userId}/${Date.now()}_${safeName}`
        const { error: upErr } = await supabase.storage.from('media').upload(path, pendingFile, {
          upsert: false,
          contentType: pendingFile.type || 'application/octet-stream',
        })
        if (upErr) throw upErr
        uploadedPath = path
        const { error: mErr } = await supabase.from('media_assets').insert({
          bucket: 'media',
          object_path: path,
          school_id: ticketSchool,
          mime_type: pendingFile.type || 'application/octet-stream',
          file_size_bytes: pendingFile.size,
          uploaded_by: userId,
          helpdesk_message_id: m.id,
        })
        if (mErr) throw mErr
      } catch (e: any) {
        // Don't leave an orphaned storage object if the DB row failed.
        if (uploadedPath) await supabase.storage.from('media').remove([uploadedPath])
        show('Reply sent, but attachment failed: ' + (e.message || e), 'error')
      }
      setPendingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    await openTicket(activeTicket)
    setSending(false)
  }

  const updateStatus = async (status: string) => {
    if (!activeTicket) return
    const { error } = await supabase.from('helpdesk_tickets').update({ status }).eq('id', activeTicket.id)
    if (error) show(error.message, 'error')
    else { setActiveTicket({ ...activeTicket, status }); await loadTickets(role === 'super_admin') }
  }

  if (loading) return <div className="card"><div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} /></div>

  const myTickets = role === 'super_admin' ? tickets : tickets.filter(t => t.user_id === userId)

  return (
    <div className="grid" style={{ gap: 16 }}>
      {role !== 'super_admin' && (
        <div className="card" style={{ background: '#fef3c7', border: '1px solid #f59e0b' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, lineHeight: 1.5 }}><strong>Privacy notice.</strong> {PRIVACY_NOTE}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{role === 'super_admin' ? 'Helpdesk — all tickets' : 'Helpdesk'}</h2>
          {role !== 'super_admin' && !showNew && (
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New ticket</button>
          )}
        </div>

        {showNew && role !== 'super_admin' && (
          <div className="card" style={{ background: 'var(--bg)', marginBottom: 16 }}>
            <h4 style={{ marginTop: 0 }}>New ticket</h4>
            <p className="helper" style={{ fontSize: 12, lineHeight: 1.5 }}>{PRIVACY_NOTE}</p>
            <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 12 }}>
              <input type="checkbox" checked={acceptedNotice} onChange={e => setAcceptedNotice(e.target.checked)} />
              I understand this conversation will only be reviewed by the Abogida team.
            </label>

            <div className="grid cols-2" style={{ gap: 10 }}>
              <div>
                <label className="helper">Category *</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">Choose a category…</option>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="helper">Subject *</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Short summary" />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label className="helper">What's happening? *</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                placeholder="Steps to reproduce, what you expected, what you saw, any error message…"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={submitTicket} disabled={submitting || !acceptedNotice || !category || !subject.trim() || !body.trim()}>
                {submitting ? <><LoadingSpinner size="sm" /> Submitting…</> : 'Submit ticket'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowNew(false); setSubject(''); setBody(''); setCategory(''); setAcceptedNotice(false) }}>Cancel</button>
            </div>
          </div>
        )}

        {myTickets.length === 0 ? (
          <div className="empty">No tickets yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: activeTicket ? '300px 1fr' : '1fr', gap: 12 }}>
            <div style={{ borderRight: activeTicket ? '1px solid var(--border)' : 'none', maxHeight: '70vh', overflow: 'auto' }}>
              {myTickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => openTicket(t)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: activeTicket?.id === t.id ? 'rgba(37,99,235,0.06)' : undefined,
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{t.subject}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span className="badge">{CATEGORIES.find(c => c.key === t.category)?.label ?? t.category}</span>
                    <span className={`badge ${t.status === 'open' ? 'badge-warning' : t.status === 'resolved' ? 'badge-success' : ''}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="helper" style={{ fontSize: 11, marginTop: 4 }}>
                    {role === 'super_admin' && t.user_name ? `${t.user_name} • ` : ''}
                    {t.school_name ? `${t.school_name} • ` : ''}
                    {new Date(t.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {activeTicket && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 360 }}>
                <div style={{ padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{activeTicket.subject}</strong>
                    <div className="helper" style={{ fontSize: 12 }}>
                      {CATEGORIES.find(c => c.key === activeTicket.category)?.label} · status: {activeTicket.status}
                    </div>
                  </div>
                  {role === 'super_admin' && (
                    <select value={activeTicket.status} onChange={e => updateStatus(e.target.value)}>
                      <option value="open">open</option>
                      <option value="in_progress">in progress</option>
                      <option value="resolved">resolved</option>
                      <option value="closed">closed</option>
                    </select>
                  )}
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {thread.map(m => {
                    const mine = m.sender_id === userId
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '75%',
                          padding: '8px 12px',
                          borderRadius: 12,
                          background: mine ? 'var(--primary)' : 'var(--bg)',
                          color: mine ? '#fff' : 'var(--text)',
                          border: mine ? 'none' : '1px solid var(--border)',
                        }}>
                          <div style={{ fontSize: 11, opacity: 0.8 }}>
                            {m.is_staff_reply ? 'Abogida support' : (m.sender_name ?? 'You')}
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 2 }}>{m.body}</div>
                          {(attachmentsByMsg[m.id] ?? []).map((a, i) => (
                            <div key={i} style={{ marginTop: 6 }}>
                              {a.mime.startsWith('image/') ? (
                                <img src={a.url} alt={a.name} style={{ maxWidth: 200, maxHeight: 160, borderRadius: 8, cursor: 'pointer' }} onClick={() => window.open(a.url, '_blank')} />
                              ) : (
                                <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: mine ? '#dbeafe' : 'var(--primary)', fontSize: 13, textDecoration: 'underline' }}>{a.name}</a>
                              )}
                            </div>
                          ))}
                          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>
                            {new Date(m.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {pendingFile && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', marginBottom: 6,
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                      fontSize: 13,
                    }}>
                      <Paperclip size={14} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pendingFile.name}
                      </span>
                      <button className="btn btn-ghost" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }} style={{ padding: 2 }} aria-label="Remove">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        if (f.size > 50 * 1024 * 1024) { show('File too large (max 50MB)', 'error'); return }
                        setPendingFile(f)
                      }}
                    />
                    <button className="btn btn-ghost" style={{ padding: 8 }} onClick={() => fileInputRef.current?.click()} aria-label="Attach"><Paperclip size={16} /></button>
                    <input
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                      placeholder={role === 'super_admin' ? 'Reply as Abogida support…' : 'Add a reply…'}
                      style={{ flex: 1, padding: '8px 12px' }}
                    />
                    <button className="btn btn-primary" onClick={sendReply} disabled={sending || (!reply.trim() && !pendingFile)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} aria-label="Send">
                      {sending ? <LoadingSpinner size="sm" /> : <Send size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
