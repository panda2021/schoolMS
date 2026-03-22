import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'

interface Conversation {
  parent_id: string
  teacher_id: string
  student_id: string | null
  other_name: string
  student_name: string
  last_message: string
  last_at: string
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
  const [role, setRole] = useState<Role | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvo, setActiveConvo] = useState<{ parent_id: string; teacher_id: string; student_id: string | null } | null>(null)

  // Thread
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // New conversation (for starting a chat)
  const [showNewConvo, setShowNewConvo] = useState(false)
  const [convoTargets, setConvoTargets] = useState<{ id: string; name: string; student_name: string; student_id: string }[]>([])
  const [selectedTarget, setSelectedTarget] = useState('')

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
        // Admin sees all school messages
        await loadConversations(r, null, null)
      }

      setLoading(false)
    }
    init()
  }, [])

  const loadConversations = async (r: Role, pid: string | null, tid: string | null) => {
    let query = supabase
      .from('messages')
      .select('parent_id, teacher_id, student_id, text_content, created_at, parents(users(full_name)), teachers(users(full_name)), students(first_name, last_name)')
      .order('created_at', { ascending: false })

    if (r === 'parent' && pid) query = query.eq('parent_id', pid)
    else if (r === 'teacher' && tid) query = query.eq('teacher_id', tid)

    const { data } = await query
    if (!data) return

    // Group by (parent_id, teacher_id, student_id) and take the latest message
    const convoMap = new Map<string, Conversation>()
    for (const msg of data as any[]) {
      const key = `${msg.parent_id}|${msg.teacher_id}|${msg.student_id ?? ''}`
      if (!convoMap.has(key)) {
        const otherName = r === 'parent'
          ? (msg.teachers?.users?.full_name ?? 'Teacher')
          : r === 'school_admin'
            ? `${msg.parents?.users?.full_name ?? 'Parent'} ↔ ${msg.teachers?.users?.full_name ?? 'Teacher'}`
            : (msg.parents?.users?.full_name ?? 'Parent')
        convoMap.set(key, {
          parent_id: msg.parent_id,
          teacher_id: msg.teacher_id,
          student_id: msg.student_id,
          other_name: otherName,
          student_name: msg.students ? `${msg.students.first_name} ${msg.students.last_name}` : '',
          last_message: msg.text_content,
          last_at: msg.created_at,
        })
      }
    }
    setConversations(Array.from(convoMap.values()))

    // Load targets for new conversation
    if (r === 'parent' && pid) {
      // Get teachers of my children's classes
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
      // Get parents of enrolled students
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
    }
  }

  const openThread = async (convo: { parent_id: string; teacher_id: string; student_id: string | null }) => {
    setActiveConvo(convo)
    setLoadingThread(true)
    let query = supabase
      .from('messages')
      .select('id, text_content, sender_id, created_at')
      .eq('parent_id', convo.parent_id)
      .eq('teacher_id', convo.teacher_id)
      .order('created_at', { ascending: true })

    if (convo.student_id) query = query.eq('student_id', convo.student_id)

    const { data } = await query
    setMessages(data ?? [])
    setLoadingThread(false)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeConvo || !userId || !schoolId) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      school_id: schoolId,
      parent_id: activeConvo.parent_id,
      teacher_id: activeConvo.teacher_id,
      student_id: activeConvo.student_id,
      sender_id: userId,
      text_content: newMsg.trim(),
    })
    if (error) { show(error.message, 'error') }
    else {
      setNewMsg('')
      await openThread(activeConvo)
    }
    setSending(false)
  }

  const startNewConversation = () => {
    if (!selectedTarget) return
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

  if (loading) return (
    <div className="card">
      <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 60, width: '100%', borderRadius: 8, marginTop: 12 }} />
    </div>
  )

  if (role !== 'parent' && role !== 'teacher' && role !== 'school_admin') {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Messages</h2>
        <p className="helper">Messaging is available for parents and teachers.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: activeConvo ? '300px 1fr' : '1fr', gap: 12, minHeight: 'calc(100vh - 120px)' }}>
      {/* Conversation list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', display: activeConvo ? undefined : 'block' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Conversations</h3>
          {convoTargets.length > 0 && role !== 'school_admin' && (
            <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setShowNewConvo(!showNewConvo)}>
              + New
            </button>
          )}
        </div>

        {showNewConvo && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <select value={selectedTarget} onChange={e => setSelectedTarget(e.target.value)} style={{ padding: '6px 8px', fontSize: 13 }}>
              <option value="">Select {role === 'parent' ? 'teacher' : 'parent'}...</option>
              {convoTargets.map(t => (
                <option key={`${t.id}-${t.student_id}`} value={`${t.id}-${t.student_id}`}>
                  {t.name} (re: {t.student_name})
                </option>
              ))}
            </select>
            <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13, marginTop: 6 }} onClick={startNewConversation} disabled={!selectedTarget}>
              Start Chat
            </button>
          </div>
        )}

        {conversations.length === 0 && !showNewConvo ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
            No conversations yet.{convoTargets.length > 0 && ' Click + New to start one.'}
          </div>
        ) : (
          <div>
            {conversations.map(c => {
              const key = `${c.parent_id}|${c.teacher_id}|${c.student_id ?? ''}`
              const isActive = activeConvo && `${activeConvo.parent_id}|${activeConvo.teacher_id}|${activeConvo.student_id ?? ''}` === key
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
                  <div style={{ fontWeight: 500 }}>{c.other_name}</div>
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
              <strong>{conversations.find(c => c.parent_id === activeConvo.parent_id && c.teacher_id === activeConvo.teacher_id)?.other_name ?? 'Chat'}</strong>
              <span className="helper" style={{ marginLeft: 8 }}>
                {conversations.find(c => c.parent_id === activeConvo.parent_id && c.teacher_id === activeConvo.teacher_id)?.student_name}
              </span>
            </div>
            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13 }} onClick={() => setActiveConvo(null)}>Close</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 300 }}>
            {loadingThread ? (
              <div style={{ textAlign: 'center', padding: 24 }}><LoadingSpinner size="md" /></div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No messages yet. Send the first one!</div>
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

          {/* Input (hidden for admin - read-only view) */}
          {role !== 'school_admin' && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <input
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type a message..."
                style={{ flex: 1, padding: '8px 12px' }}
              />
              <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !newMsg.trim()}>
                {sending ? <LoadingSpinner size="sm" /> : 'Send'}
              </button>
            </div>
          )}
          {role === 'school_admin' && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <span className="helper">Read-only view — admin cannot send messages</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
