import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { useLanguage } from '@/i18n/LanguageProvider'
import { validateDob } from '@/lib/validate'

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
  const { t } = useLanguage()
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
  const [formClassId, setFormClassId] = useState('')
  const [saving, setSaving] = useState(false)
  const [availableClasses, setAvailableClasses] = useState<{ id: string; name: string }[]>([])

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

  // Search filter
  const [searchQuery, setSearchQuery] = useState('')

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

    // Load classes for enrollment dropdown (admin)
    if (r === 'school_admin') {
      const { data: cls } = await supabase.from('classes').select('id, name').is('deleted_at', null).order('name')
      setAvailableClasses(cls ?? [])
    }

    // Teachers see only students enrolled in their classes (own classes + subjects they teach)
    let teacherStudentIds: string[] | null = null
    if (r === 'teacher') {
      const { data: tch } = await supabase.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
      if (tch?.id) {
        const { data: ownClasses } = await supabase.from('classes').select('id').eq('teacher_id', tch.id).is('deleted_at', null)
        const { data: subjectClasses } = await supabase.from('class_subject_teachers').select('class_id').eq('teacher_id', tch.id)
        const classIds = [
          ...(ownClasses ?? []).map(c => c.id),
          ...(subjectClasses ?? []).map(c => c.class_id),
        ]
        const uniqueClassIds = [...new Set(classIds)]
        if (uniqueClassIds.length === 0) { setStudents([]); return }
        const { data: enrolls } = await supabase
          .from('enrollments')
          .select('student_id')
          .in('class_id', uniqueClassIds)
          .is('deleted_at', null)
        teacherStudentIds = [...new Set((enrolls ?? []).map(e => e.student_id))]
        if (teacherStudentIds.length === 0) { setStudents([]); return }
      } else {
        setStudents([])
        return
      }
    }

    let qb = supabase
      .from('students')
      .select('id, first_name, last_name, date_of_birth, gender, guardian_name, guardian_phone, emergency_contact, medical_notes, enrollments(classes(name))')
      .is('deleted_at', null)
      .order('first_name')

    if (teacherStudentIds) {
      qb = qb.in('id', teacherStudentIds)
    }

    const { data } = await qb

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

  const filteredStudents = searchQuery.trim()
    ? students.filter(s => {
        const q = searchQuery.trim().toLowerCase()
        return (
          (`${s.first_name} ${s.last_name}`.toLowerCase().includes(q)) ||
          (s.guardian_name ?? '').toLowerCase().includes(q) ||
          (s.guardian_phone ?? '').toLowerCase().includes(q) ||
          s.classes.some(c => c.toLowerCase().includes(q))
        )
      })
    : students

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
    const dobCheck = validateDob(formDob)
    if (!dobCheck.ok) { show(dobCheck.error!, 'error'); return }
    setSaving(true)
    const { data: student, error } = await supabase.from('students').insert({
      school_id: schoolId,
      first_name: formFirst.trim(),
      last_name: formLast.trim(),
      date_of_birth: formDob || null,
      gender: formGender || null,
      guardian_name: formGuardianName.trim() || null,
      guardian_phone: formGuardianPhone.trim() || null,
      emergency_contact: formEmergency.trim() || null,
      medical_notes: formMedical.trim() || null,
    }).select('id').single()
    if (error) { show(error.message, 'error') }
    else if (student) {
      // Auto-enroll in class if selected
      if (formClassId) {
        const { error: enrollErr } = await supabase.from('enrollments').insert({
          school_id: schoolId,
          class_id: formClassId,
          student_id: student.id,
        })
        if (enrollErr) show(`Student created but enrollment failed: ${enrollErr.message}`, 'error')
      }
      show('Student added' + (formClassId ? ' and enrolled' : ''), 'success')
      resetCreateForm()
      setFormClassId('')
      setShowCreate(false)
      await loadStudents(schoolId)
    }
    setSaving(false)
  }

  const handleEdit = async (id: string) => {
    const dobCheck = validateDob(editDob)
    if (!dobCheck.ok) { show(dobCheck.error!, 'error'); return }
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
          <h2 style={{ margin: 0 }}>{t('students.title')}</h2>
          {role === 'school_admin' && !showCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('students.add')}</button>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, guardian, phone, or class…"
            style={{ width: '100%', padding: '8px 12px' }}
            aria-label="Search students"
          />
        </div>

        {/* Create form */}
        {showCreate && role === 'school_admin' && (
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg)' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>{t('students.new')}</h4>

            <p className="helper" style={{ margin: '0 0 8px 0' }}>{t('students.studentInfo')}</p>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div>
                <label className="helper">{t('students.firstName')}</label>
                <input value={formFirst} onChange={e => setFormFirst(e.target.value)} placeholder={t('students.firstNamePlaceholder')} />
              </div>
              <div>
                <label className="helper">{t('students.lastName')}</label>
                <input value={formLast} onChange={e => setFormLast(e.target.value)} placeholder={t('students.lastNamePlaceholder')} />
              </div>
              <div>
                <label className="helper">{t('students.dob')}</label>
                <input type="date" value={formDob} onChange={e => setFormDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                {formDob && !validateDob(formDob).ok && (
                  <small style={{ color: '#dc2626' }}>{validateDob(formDob).error}</small>
                )}
              </div>
              <div>
                <label className="helper">{t('students.gender')}</label>
                <select value={formGender} onChange={e => setFormGender(e.target.value)}>
                  <option value="">{t('students.select')}</option>
                  <option value="male">{t('students.male')}</option>
                  <option value="female">{t('students.female')}</option>
                </select>
              </div>
            </div>

            <hr />
            <p className="helper" style={{ margin: '0 0 8px 0' }}>{t('students.guardianInfo')}</p>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div>
                <label className="helper">{t('students.guardianName')}</label>
                <input value={formGuardianName} onChange={e => setFormGuardianName(e.target.value)} placeholder={t('students.guardianNamePlaceholder')} />
              </div>
              <div>
                <label className="helper">{t('students.guardianPhone')}</label>
                <input value={formGuardianPhone} onChange={e => setFormGuardianPhone(e.target.value)} placeholder={t('students.guardianPhonePlaceholder')} />
              </div>
              <div>
                <label className="helper">{t('students.emergencyContact')}</label>
                <input value={formEmergency} onChange={e => setFormEmergency(e.target.value)} placeholder={t('students.emergencyPlaceholder')} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="helper">{t('students.medicalNotes')}</label>
              <textarea value={formMedical} onChange={e => setFormMedical(e.target.value)} rows={2} placeholder={t('students.medicalPlaceholder')} />
            </div>

            <hr />
            <p className="helper" style={{ margin: '0 0 8px 0' }}>{t('students.classEnrollment')}</p>
            <div>
              <label className="helper">{t('students.enrollInClass')}</label>
              <select value={formClassId} onChange={e => setFormClassId(e.target.value)}>
                <option value="">{t('students.dontEnroll')}</option>
                {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !formFirst.trim() || !formLast.trim()}>
                {saving ? <><LoadingSpinner size="sm" /> {t('common.saving')}</> : t('students.addStudent')}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowCreate(false); resetCreateForm() }}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {students.length === 0 ? (
          <div className="empty">{t('students.noStudents')}</div>
        ) : filteredStudents.length === 0 ? (
          <div className="empty">No students match "{searchQuery}".</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('students.gender')}</th>
                <th>{t('students.dob')}</th>
                <th>{t('students.classEnrollment')}</th>
                {role === 'school_admin' && <th style={{ width: 160 }}>{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(s => (
                editId === s.id && role === 'school_admin' ? (
                  <tr key={s.id}>
                    <td colSpan={role === 'school_admin' ? 5 : 4}>
                      <div className="card" style={{ background: 'var(--bg)', margin: '4px 0' }}>
                        <p className="helper" style={{ margin: '0 0 8px 0' }}>{t('students.editStudent')}</p>
                        <div className="grid cols-2" style={{ gap: 10 }}>
                          <div>
                            <label className="helper">{t('students.firstName')}</label>
                            <input value={editFirst} onChange={e => setEditFirst(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">{t('students.lastName')}</label>
                            <input value={editLast} onChange={e => setEditLast(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">{t('students.dob')}</label>
                            <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} style={{ padding: '6px 8px' }} max={new Date().toISOString().slice(0, 10)} />
                            {editDob && !validateDob(editDob).ok && (
                              <small style={{ color: '#dc2626' }}>{validateDob(editDob).error}</small>
                            )}
                          </div>
                          <div>
                            <label className="helper">{t('students.gender')}</label>
                            <select value={editGender} onChange={e => setEditGender(e.target.value)} style={{ padding: '6px 8px' }}>
                              <option value="">{t('students.select')}</option>
                              <option value="male">{t('students.male')}</option>
                              <option value="female">{t('students.female')}</option>
                            </select>
                          </div>
                        </div>
                        <hr />
                        <div className="grid cols-2" style={{ gap: 10 }}>
                          <div>
                            <label className="helper">{t('students.guardianName')}</label>
                            <input value={editGuardianName} onChange={e => setEditGuardianName(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">{t('students.guardianPhone')}</label>
                            <input value={editGuardianPhone} onChange={e => setEditGuardianPhone(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                          <div>
                            <label className="helper">{t('students.emergencyContact')}</label>
                            <input value={editEmergency} onChange={e => setEditEmergency(e.target.value)} style={{ padding: '6px 8px' }} />
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <label className="helper">{t('students.medicalNotes')}</label>
                          <textarea value={editMedical} onChange={e => setEditMedical(e.target.value)} rows={2} style={{ padding: '6px 8px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => handleEdit(s.id)} disabled={saving}>
                            {saving ? <LoadingSpinner size="sm" /> : t('common.save')}
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setEditId(null)}>{t('common.cancel')}</button>
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
                          ? <span className="helper">{t('students.notEnrolled')}</span>
                          : s.classes.map(cn => <span key={cn} className="badge" style={{ marginRight: 4 }}>{cn}</span>)
                        }
                      </td>
                      {role === 'school_admin' && (
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13 }} onClick={() => startEdit(s)}>{t('common.edit')}</button>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 13, color: '#dc2626' }} onClick={() => handleDelete(s.id, `${s.first_name} ${s.last_name}`)}>{t('common.delete')}</button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {expandedId === s.id && (
                      <tr key={`${s.id}-detail`}>
                        <td colSpan={role === 'school_admin' ? 5 : 4} style={{ background: 'var(--bg)', padding: 12 }}>
                          <div className="grid cols-3" style={{ gap: 10, fontSize: 13 }}>
                            <div><span className="helper">{t('students.guardian')}:</span> {s.guardian_name || '-'}</div>
                            <div><span className="helper">{t('students.guardianPhone')}:</span> {s.guardian_phone || '-'}</div>
                            <div><span className="helper">{t('students.emergency')}:</span> {s.emergency_contact || '-'}</div>
                          </div>
                          {s.medical_notes && (
                            <div style={{ marginTop: 6, fontSize: 13 }}>
                              <span className="helper">{t('students.medicalNotes')}:</span> {s.medical_notes}
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
