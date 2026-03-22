import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Modal } from './Modal'
import { LoadingSpinner } from './LoadingSpinner'
import { useToast } from './toast/ToastProvider'

interface Props {
  open: boolean
  onClose: () => void
  schoolId: string
  onComplete?: () => void
}

interface ClassOption { id: string; name: string }
interface ParentOption { id: string; full_name: string }

const STEPS = ['Student Info', 'Class', 'Parent', 'Review']

export const QuickEnrollWizard: React.FC<Props> = ({ open, onClose, schoolId, onComplete }) => {
  const { show } = useToast()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Step 1: Student info
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')

  // Step 2: Class
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClass, setSelectedClass] = useState('')

  // Step 3: Parent
  const [parents, setParents] = useState<ParentOption[]>([])
  const [selectedParent, setSelectedParent] = useState('')
  const [relation, setRelation] = useState('guardian')

  useEffect(() => {
    if (!open) return
    // Reset
    setStep(0); setFirstName(''); setLastName(''); setDob(''); setGender('')
    setGuardianName(''); setGuardianPhone(''); setSelectedClass(''); setSelectedParent(''); setRelation('guardian')

    // Load options
    const loadOptions = async () => {
      const { data: cls } = await supabase.from('classes').select('id, name').is('deleted_at', null).order('name')
      setClasses(cls ?? [])

      const { data: prts } = await supabase.from('parents').select('id, users(full_name)').is('deleted_at', null)
      setParents((prts ?? []).map((p: any) => ({ id: p.id, full_name: p.users?.full_name ?? 'Unknown' })))
    }
    loadOptions()
  }, [open])

  const canNext = () => {
    if (step === 0) return firstName.trim() && lastName.trim()
    return true // Steps 1,2 are optional (skip)
  }

  const handleSubmit = async () => {
    setSaving(true)

    // 1. Create student
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

    // 2. Enroll in class
    if (selectedClass) {
      const { error: enrollErr } = await supabase.from('enrollments').insert({
        school_id: schoolId,
        class_id: selectedClass,
        student_id: student.id,
      })
      if (enrollErr) show(`Enrolled student but class enrollment failed: ${enrollErr.message}`, 'error')
    }

    // 3. Link to parent
    if (selectedParent) {
      const { error: linkErr } = await supabase.from('parent_students').insert({
        parent_id: selectedParent,
        student_id: student.id,
        relation: relation || null,
      })
      if (linkErr) show(`Student created but parent link failed: ${linkErr.message}`, 'error')
    }

    show('Student enrolled successfully!', 'success')
    setSaving(false)
    onComplete?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Quick Enroll Student">
      {/* Step indicator */}
      <div className="step-indicator">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} title={s} />
        ))}
      </div>
      <p className="helper" style={{ textAlign: 'center', marginTop: -12, marginBottom: 16 }}>{STEPS[step]}</p>

      {/* Step 0: Student Info */}
      {step === 0 && (
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
              <input type="date" value={dob} onChange={e => setDob(e.target.value)} />
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

      {/* Step 1: Class */}
      {step === 1 && (
        <div>
          <label className="helper">Enroll in Class (optional)</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">Skip — enroll later</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="helper" style={{ marginTop: 8 }}>You can always enroll the student later from the Classes page.</p>
        </div>
      )}

      {/* Step 2: Parent */}
      {step === 2 && (
        <div>
          <label className="helper">Link to Parent (optional)</label>
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
          <p className="helper" style={{ marginTop: 8 }}>You can link parents from the Admin Dashboard anytime.</p>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="card" style={{ background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div><strong>Student:</strong> {firstName} {lastName}</div>
            {dob && <div><span className="helper">DOB:</span> {dob}</div>}
            {gender && <div><span className="helper">Gender:</span> {gender}</div>}
            {guardianName && <div><span className="helper">Guardian:</span> {guardianName} {guardianPhone && `(${guardianPhone})`}</div>}
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
            {step === 0 ? 'Next' : 'Next (or Skip)'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <><LoadingSpinner size="sm" /> Creating...</> : 'Create & Enroll'}
          </button>
        )}
      </div>
    </Modal>
  )
}
