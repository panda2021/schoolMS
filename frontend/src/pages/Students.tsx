import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'

interface StudentRow {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  gender: string | null
  guardian_name: string | null
  guardian_phone: string | null
  emergency_contact: string | null
  medical_notes: string | null
  classes: string[]
}

type Role = 'teacher' | 'parent' | 'school_admin'

export default function Students() {
  const { show } = useToast()
  const [role, setRole] = useState<Role | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [formFirst, setFormFirst] = useState('')
  const [formLast, setFormLast] = useState('')
  const [formDob, setFormDob] = useState('')
  const [formGender, setFormGender] = useState('')
  const [formGuardianName, setFormGuardianName] = useState('')
  const [formGuardianPhone, setFormGuardianPhone] = useState('')
  const [formEmergency, setFormEmergency] = useState('')
  const [formMedical, setFormMedical] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editFirst, setEditFirst] = useState('')
  const [editLast, setEditLast] = useState('')
  const [editDob, setEditDob] = useState('')
  const [editGender, setEditGender] = useState('')
  const [editGuardianName, setEditGuardianName] = useState('')
  const [editGuardianPhone, setEditGuardianPhone] = useState('')
  const [editEmergency, setEditEmergency] = useState('')
  const [editMedical, setEditMedical] = useState('')

  // Detail expand
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const resetCreateForm = () => {
    setFormFirst(''); setFormLast(''); setFormDob(''); setFormGender('')
    setFormGuardianName(''); setFormGuardianPhone(''); setFormEmergency(''); setFormMedical('')
  }

  const loadStudents = async (sid?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
    const r = (me?.role_key ?? null) as Role | null
    const school = sid ?? me?.school_id
    setRole(r)
    setSchoolId(school)

    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, date_of_birth, gender, guardian_name, guardian_phone, emergency_contact, medical_notes, enrollments(classes(name))')
      .is('deleted_at', null)
      .order('first_name')

    setStudents((data ?? []).map((s: any) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      date_of_birth: s.date_of_birth,
      gender: s.gender,
      guardian_name: s.guardian_name,
      guardian_phone: s.guardian_phone,
      emergency_contact: s.emergency_contact,
      medical_notes: s.medical_notes,
      classes: (s.enrollments ?? []).map((e: any) => e.classes?.name).filter(Boolean),
    })))
  }

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await loadStudents()
      setLoading(false)
    }
    init()
  }, [])

  const handleCreate = async () => {
    if (!formFirst.trim() || !formLast.trim() || !schoolId) return
    setSaving(true)
    const { error } = await supabase.from('students').insert({
      school_id: schoolId,
      first_name: formFirst.trim(),
      last_name: formLast.trim(),
      date_of_birth: formDob || null,
      gender: formGender || null,
      guardian_name: formGuardianName.trim() || null,
      guardian_phone: formGuardianPhone.trim() || null,
      emergency_contact: formEmergency.trim() || null,
      medical_notes: formMedical.trim() || null,
    })
    if (error) { show(error.message, 'error') }
    else {
      show('Student added', 'success')
      resetCreateForm()
      setShowCreate(false)
      await loadStudents(schoolId)
    }
    setSaving(false)
  }

  const handleEdit = async (id: string) => {
    setSaving(true)
    const { error } = await supabase.from('students').update({
      first_name: editFirst.trim(),
      last_name: editLast.trim(),
      date_of_birth: editDob || null,
      gender: editGender || null,
      guardian_name: editGuardianName.trim() || null,
      guardian_phone: editGuardianPhone.trim() || null,
      emergency_contact: editEmergency.trim() || null,
      medical_notes: editMedical.trim() || null,
    }).eq('id', id)
    if (error) { show(error.message, 'error') }
    else {
      show('Student updated', 'success')
      setEditId(null)
      await loadStudents(schoolId!)
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete student "${name}"?`)) return
    const { error } = await supabase.from('students').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { show(error.message, 'error') }
    else {
      show('Student deleted', 'success')
      await loadStudents(schoolId!)
    }
  }

  const startEdit = (s: StudentRow) => {
    setEditId(s.id)
    setEditFirst(s.first_name)
    setEditLast(s.last_name)
    setEditDob(s.date_of_birth ?? '')
    setEditGender(s.gender ?? '')
    setEditGuardianName(s.guardian_name ?? '')
    setEditGuardianPhone(s.guardian_phone ?? '')
    setEditEmergency(s.emergency_contact ?? '')
    setEditMedical(s.medical_notes ?? '')
  }

  if (loading) return (
    <div className="card">
      <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 12, width: '100%', borderRadius: 8, marginTop: 12 }} />
      <div className="skeleton" style={{ height: 12, width: '90%', borderRadius: 8, marginTop: 8 }} />
    </div>
  )

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Students</h2>
          {role === 'school_admin' && !showCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Student</button>
          )}
        </div>

        {/* Create form */}
        {showCreate && role === 'school_admin' && (
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>New Student</h4>

            <p className="helper" style={{ margin: '0 0 8px 0' }}>Student Information</p>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div>
                <label className="helper">First Name *</label>
                <input value={formFirst} onChange={e => setFormFirst(e.target.value)} placeholder="First name" />
              </div>
              <div>
                <label className="helper">Last Name *</label>
                <input value={formLast} onChange={e => setFormLast(e.target.value)} placeholder="Last name" />
              </div>
              <div>
                <label className="helper">Date of Birth</label>
                <input type="date" value={formDob} onChange={e => setFormDob(e.target.value)} />
              </div>
              <div>
                <label className="helper">Gender</label>
                <select value={formGender} onChange={e => setFormGender(e.target.value)}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>

            <hr />
            <p className="helper" style={{ margin: '0 0 8px 0' }}>Guardian & Emergency</p>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div>
                <label className="helper">Guardian Name</label>
                <input value={formGuardianName} onChange={e => setFormGuardianName(e.target.value)} placeholder="Parent or guardian name" />
              </div>
              <div>
                <label className="helper">Guardian Phone</label>
                <input value={formGuardianPhone} onChange={e => setFormGuardianPhone(e.target.value)} placeholder="+251..." />
              </div>
              <div>
                <label className="helper">Emergency Contact</label>
                <input value={formEmergency} onChange={e => setFormEmergency(e.target.value)} placeholder="Emergency phone number" />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="helper">Medical Notes</label>
              <textarea value={formMedical} onChange={e => setFormMedical(e.target.value)} rows={2} placeholder="Allergies, conditions, or special needs (optional)" />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !formFirst.trim() || !formLast.trim()}>
                {saving ? <><LoadingSpinner size="sm" /> Saving...</> : 'Add Student'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowCreate(false); resetCreateForm() }}>Cancel</button>
            </div>
          </div>
        )}

        {students.length === 0 ? (
          <div className="empty">No students to display.{role === 'school_admin' && ' Click "Add Student" to add one.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Gender</th>
                <th>DOB</th>
                <th>Classes</th>
                {role === 'school_admin' && <th style={{ width: 160 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                editId === s.id && role === 'school_admin' ? (
                  <tr key={s.id}>
                    <td colSpan={role === 'school_admin' ? 5 : 4}>
                      <div className="card" style={{ background: 'var(--bg)', margin: '4px 0' }}>
                        <p className="helper" style={{ margin: '0 0 8px 0' }}>Edit Student</p>
                        <div className="grid cols-2" style={{ gap: 10 }}>
                          <div>
                            <label className="helper">First Name *</label>
                            <input value={editFirst} onChange={e => setEditFirst(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">Last Name *</label>
                            <input value={editLast} onChange={e => setEditLast(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">Date of Birth</label>
                            <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">Gender</label>
                            <select value={editGender} onChange={e => setEditGender(e.target.value)} style={{ padding: '6px 8px' }}>
                              <option value="">Select</option>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </select>
                          </div>
                        </div>
                        <hr />
                        <div className="grid cols-2" style={{ gap: 10 }}>
                          <div>
                            <label className="helper">Guardian Name</label>
                            <input value={editGuardianName} onChange={e => setEditGuardianName(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">Guardian Phone</label>
                            <input value={editGuardianPhone} onChange={e => setEditGuardianPhone(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">Emergency Contact</label>
                            <input value={editEmergency} onChange={e => setEditEmergency(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <label className="helper">Medical Notes</label>
                          <textarea value={editMedical} onChange={e => setEditMedical(e.target.value)} rows={2} style={{ padding: '6px 8px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => handleEdit(s.id)} disabled={saving}>
                            {saving ? <LoadingSpinner size="sm" /> : 'Save'}
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setEditId(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                      <td style={{ fontWeight: 500 }}>{s.first_name} {s.last_name}</td>
                      <td>{s.gender ? s.gender.charAt(0).toUpperCase() + s.gender.slice(1) : '-'}</td>
                      <td>{s.date_of_birth ?? '-'}</td>
                      <td>
                        {s.classes.length === 0
                          ? <span className="helper">Not enrolled</span>
                          : s.classes.map(cn => <span key={cn} className="badge" style={{ marginRight: 4 }}>{cn}</span>)
                        }
                      </td>
                      {role === 'school_admin' && (
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13 }} onClick={() => startEdit(s)}>Edit</button>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13, color: '#dc2626' }} onClick={() => handleDelete(s.id, `${s.first_name} ${s.last_name}`)}>Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {expandedId === s.id && (
                      <tr key={`${s.id}-detail`}>
                        <td colSpan={role === 'school_admin' ? 5 : 4} style={{ background: 'var(--bg)', padding: 12 }}>
                          <div className="grid cols-3" style={{ gap: 10, fontSize: 13 }}>
                            <div><span className="helper">Guardian:</span> {s.guardian_name || '-'}</div>
                            <div><span className="helper">Guardian Phone:</span> {s.guardian_phone || '-'}</div>
                            <div><span className="helper">Emergency:</span> {s.emergency_contact || '-'}</div>
                          </div>
                          {s.medical_notes && (
                            <div style={{ marginTop: 6, fontSize: 13 }}>
                              <span className="helper">Medical Notes:</span> {s.medical_notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
