import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Modal } from './Modal'
import { LoadingSpinner } from './LoadingSpinner'
import { useToast } from './toast/ToastProvider'
import { validateDob } from '@/lib/validate'

interface Props {
  open: boolean
  onClose: () => void
  schoolId: string
  onComplete?: () => void
}

interface ClassOption { id: string; name: string }
interface ParentOption { id: string; full_name: string }
interface ExistingStudent { id: string; first_name: string; last_name: string }

const STEPS = ['Student', 'Class', 'Parent', 'Review']

export const QuickEnrollWizard: React.FC<Props> = ({ open, onClose, schoolId, onComplete }) => {
  const { show } = useToast()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Mode: create new or use existing
  const [mode, setMode] = useState<'new' | 'existing'>('existing')
  const [existingStudents, setExistingStudents] = useState<ExistingStudent[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedExisting, setSelectedExisting] = useState<ExistingStudent | null>(null)

  // New student fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')

  // Class
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClass, setSelectedClass] = useState('')

  // Parent
  const [parents, setParents] = useState<ParentOption[]>([])
  const [selectedParent, setSelectedParent] = useState('')
  const [relation, setRelation] = useState('guardian')

  useEffect(() => {
    if (!open) return
    setStep(0); setMode('existing'); setSearchQuery(''); setSelectedExisting(null)
    setFirstName(''); setLastName(''); setDob(''); setGender('')
    setGuardianName(''); setGuardianPhone(''); setSelectedClass(''); setSelectedParent(''); setRelation('guardian')

    const loadOptions = async () => {
      const [clsRes, prtsRes, studsRes] = await Promise.all([
        supabase.from('classes').select('id, name').is('deleted_at', null).order('name'),
        supabase.from('parents').select('id, users(full_name)').is('deleted_at', null),
        supabase.from('students').select('id, first_name, last_name').is('deleted_at', null).order('first_name'),
      ])
      setClasses(clsRes.data ?? [])
      setParents((prtsRes.data ?? []).map((p: any) => ({ id: p.id, full_name: p.users?.full_name ?? 'Unknown' })))
      setExistingStudents(studsRes.data ?? [])
    }
    loadOptions()
  }, [open])

  const filteredStudents = searchQuery.trim()
    ? existingStudents.filter(s =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : existingStudents

  const studentName = mode === 'existing' && selectedExisting
    ? `${selectedExisting.first_name} ${selectedExisting.last_name}`
    : `${firstName} ${lastName}`

  const canNext = () => {
    if (step === 0) {
      if (mode === 'existing') return !!selectedExisting
      if (!firstName.trim() || !lastName.trim()) return false
      return validateDob(dob).ok
    }
    return true
  }

  const handleSubmit = async () => {
    if (mode === 'new') {
      const dobCheck = validateDob(dob)
      if (!dobCheck.ok) { show(dobCheck.error!, 'error'); return }
    }
    setSaving(true)
    let studentId: string

    if (mode === 'existing' && selectedExisting) {
      studentId = selectedExisting.id
    } else {
      const { data: student, error: studErr } = await supabase.from('students').insert({
        school_id: schoolId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dob || null,
        gender: gender || null,
        guardian_name: guardianName.trim() || null,
        guardian_phone: guardianPhone.trim() || null,
      }).select('id').single()

      if (studErr || !student) {
        show(studErr?.message ?? 'Failed to create student', 'error')
        setSaving(false)
        return
      }
      studentId = student.id
    }

    // Enroll in class
    if (selectedClass) {
      const { error: enrollErr } = await supabase.from('enrollments').insert({
        school_id: schoolId,
        class_id: selectedClass,
        student_id: studentId,
      })
      if (enrollErr) show(`Class enrollment failed: ${enrollErr.message}`, 'error')
    }

    // Link to parent
    if (selectedParent) {
      const { error: linkErr } = await supabase.from('parent_students').insert({
        parent_id: selectedParent,
        student_id: studentId,
        relation: relation || null,
      })
      if (linkErr) show(`Parent link failed: ${linkErr.message}`, 'error')
    }

    show('Student enrolled successfully!', 'success')
    setSaving(false)
    onComplete?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Quick Enroll" wide>
      {/* Step indicator */}
      <div className="step-indicator">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} title={s} />
        ))}
      </div>
      <p className="helper" style={{ textAlign: 'center', marginTop: -12, marginBottom: 16 }}>{STEPS[step]}</p>

      {/* Step 0: Student — existing or new */}
      {step === 0 && (
        <div>
          {/* Mode toggle */}
          <div className="tab-bar" style={{ marginBottom: 12 }}>
            <button className={`tab-btn ${mode === 'existing' ? 'active' : ''}`} onClick={() => { setMode('existing'); setSelectedExisting(null) }}>
              Search Existing
            </button>
            <button className={`tab-btn ${mode === 'new' ? 'active' : ''}`} onClick={() => setMode('new')}>
              Create New
            </button>
          </div>

          {mode === 'existing' ? (
            <div>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name..."
                style={{ marginBottom: 8 }}
              />
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                {filteredStudents.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>
                    No students found.{' '}
                    <button className="btn btn-ghost" style={{ padding: 0, textDecoration: 'underline', color: 'var(--primary)' }} onClick={() => setMode('new')}>
                      Create new
                    </button>
                  </div>
                ) : (
                  filteredStudents.map(s => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedExisting(s)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        background: selectedExisting?.id === s.id ? 'rgba(37,99,235,0.08)' : undefined,
                        fontWeight: selectedExisting?.id === s.id ? 600 : 400,
                      }}
                    >
                      {s.first_name} {s.last_name}
                      {selectedExisting?.id === s.id && <span style={{ float: 'right', color: 'var(--primary)' }}>Selected</span>}
                    </div>
                  ))
                )}
              </div>
              {selectedExisting && (
                <p style={{ marginTop: 8, fontSize: 14 }}>
                  Selected: <strong>{selectedExisting.first_name} {selectedExisting.last_name}</strong>
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="grid cols-2" style={{ gap: 10 }}>
                <div>
                  <label className="helper">First Name *</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
                </div>
                <div>
                  <label className="helper">Last Name *</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
                </div>
                <div>
                  <label className="helper">Date of Birth</label>
                  <input type="date" value={dob} onChange={e => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                  {dob && !validateDob(dob).ok && (
                    <small style={{ color: '#dc2626' }}>{validateDob(dob).error}</small>
                  )}
                </div>
                <div>
                  <label className="helper">Gender</label>
                  <select value={gender} onChange={e => setGender(e.target.value)}>
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
                  <input value={guardianName} onChange={e => setGuardianName(e.target.value)} placeholder="Parent/guardian" />
                </div>
                <div>
                  <label className="helper">Guardian Phone</label>
                  <input value={guardianPhone} onChange={e => setGuardianPhone(e.target.value)} placeholder="+251..." />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Class */}
      {step === 1 && (
        <div>
          <label className="helper">Enroll in Class</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">Skip — enroll later</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Step 2: Parent */}
      {step === 2 && (
        <div>
          <label className="helper">Link to Parent</label>
          <select value={selectedParent} onChange={e => setSelectedParent(e.target.value)}>
            <option value="">Skip — link later</option>
            {parents.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          {selectedParent && (
            <div style={{ marginTop: 10 }}>
              <label className="helper">Relation</label>
              <select value={relation} onChange={e => setRelation(e.target.value)}>
                <option value="mother">Mother</option>
                <option value="father">Father</option>
                <option value="guardian">Guardian</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="card" style={{ background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div><strong>Student:</strong> {studentName} {mode === 'existing' ? <span className="badge" style={{ marginLeft: 4 }}>Existing</span> : <span className="badge badge-success" style={{ marginLeft: 4 }}>New</span>}</div>
            {mode === 'new' && dob && <div><span className="helper">DOB:</span> {dob}</div>}
            {mode === 'new' && guardianName && <div><span className="helper">Guardian:</span> {guardianName}</div>}
            <hr />
            <div><strong>Class:</strong> {selectedClass ? classes.find(c => c.id === selectedClass)?.name : <span className="helper">Skipped</span>}</div>
            <div><strong>Parent:</strong> {selectedParent ? `${parents.find(p => p.id === selectedParent)?.full_name} (${relation})` : <span className="helper">Skipped</span>}</div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button className="btn btn-secondary" onClick={() => step === 0 ? onClose() : setStep(step - 1)}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < 3 ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={!canNext()}>
            Next
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <><LoadingSpinner size="sm" /> Enrolling...</> : (mode === 'existing' ? 'Enroll' : 'Create & Enroll')}
          </button>
        )}
      </div>
    </Modal>
  )
}
