import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { useLanguage } from '@/i18n/LanguageProvider'

interface ClassSubject {
  class_id: string
  class_name: string
  subject_id: string
  subject_name: string
}

interface AssessmentType {
  id: string
  name: string
  weight: number
  term_label: string
}

interface StudentRow {
  id: string
  first_name: string
  last_name: string
}

interface ExistingGrade {
  student_id: string
  score: number
}

interface ExistingExemption {
  student_id: string
  reason: string
}

const EXEMPT_REASONS = [
  { key: 'disqualification', label: 'grades.disqualification' },
  { key: 'examIssues', label: 'grades.examIssues' },
  { key: 'healthAbsence', label: 'grades.healthAbsence' },
  { key: 'transfer', label: 'grades.transfer' },
  { key: 'other', label: 'grades.other' },
]

export default function Grades() {
  const { show } = useToast()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState<string | null>(null)

  // Selectors
  const [assignments, setAssignments] = useState<ClassSubject[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([])
  const [selectedAssessment, setSelectedAssessment] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')

  // Grade entry
  const [students, setStudents] = useState<StudentRow[]>([])
  const [scores, setScores] = useState<Record<string, string>>({})
  const [exemptions, setExemptions] = useState<Record<string, string>>({})
  const [exempted, setExempted] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(false)

  // Inline create-assessment
  const [showNewAssessment, setShowNewAssessment] = useState(false)
  const [newAssessmentName, setNewAssessmentName] = useState('')
  const [newAssessmentWeight, setNewAssessmentWeight] = useState('20')
  const [newAssessmentTerm, setNewAssessmentTerm] = useState('Term 1')
  const [creatingAssessment, setCreatingAssessment] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
      setRole(me?.role_key ?? null)
      setSchoolId(me?.school_id ?? null)

      if (me?.role_key === 'teacher') {
        const { data: tch } = await supabase.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
        setTeacherId(tch?.id ?? null)
        if (tch?.id) {
          const { data: cst } = await supabase
            .from('class_subject_teachers')
            .select('class_id, subject_id, classes(name), subjects(name)')
            .eq('teacher_id', tch.id)
          setAssignments((cst ?? []).map((row: any) => ({
            class_id: row.class_id,
            class_name: row.classes?.name ?? '',
            subject_id: row.subject_id,
            subject_name: row.subjects?.name ?? '',
          })))
        }
      }

      // Load assessment types
      const { data: at } = await supabase
        .from('assessment_types')
        .select('id, name, weight, term_label')
        .eq('is_active', true)
        .order('term_label')
        .order('name')
      setAssessmentTypes(at ?? [])

      setLoading(false)
    }
    init()
  }, [])

  // Get unique classes from assignments
  const uniqueClasses = [...new Map(assignments.map(a => [a.class_id, { id: a.class_id, name: a.class_name }])).values()]

  // Get subjects for selected class
  const classSubjects = assignments.filter(a => a.class_id === selectedClass)

  // Get unique terms
  const terms = [...new Set(assessmentTypes.map(a => a.term_label))]

  // Get assessments for selected term
  const termAssessments = assessmentTypes.filter(a => a.term_label === selectedTerm)

  // Load students and existing grades when all selectors are filled
  useEffect(() => {
    if (!selectedClass || !selectedSubject || !selectedAssessment || !selectedTerm) {
      setStudents([]); setScores({}); setExemptions({}); setExempted({})
      return
    }
    const load = async () => {
      setLoadingStudents(true)
      // Get enrolled students
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('student_id, students(id, first_name, last_name)')
        .eq('class_id', selectedClass)
        .is('deleted_at', null)
      const studs: StudentRow[] = (enrolls ?? []).map((e: any) => ({
        id: e.students?.id ?? e.student_id,
        first_name: e.students?.first_name ?? '',
        last_name: e.students?.last_name ?? '',
      }))
      studs.sort((a, b) => a.first_name.localeCompare(b.first_name))
      setStudents(studs)

      // Load existing grades
      const studentIds = studs.map(s => s.id)
      if (studentIds.length > 0) {
        const { data: gradeData } = await supabase
          .from('grades')
          .select('student_id, score')
          .eq('subject_id', selectedSubject)
          .eq('assessment_type_id', selectedAssessment)
          .eq('term_label', selectedTerm)
          .in('student_id', studentIds)

        const sc: Record<string, string> = {}
        for (const g of (gradeData ?? []) as ExistingGrade[]) {
          sc[g.student_id] = String(g.score)
        }
        setScores(sc)

        // Load exemptions
        const { data: exData } = await supabase
          .from('grade_exemptions')
          .select('student_id, reason')
          .eq('subject_id', selectedSubject)
          .eq('term_label', selectedTerm)
          .in('student_id', studentIds)

        const ex: Record<string, string> = {}
        const exFlags: Record<string, boolean> = {}
        for (const e of (exData ?? []) as ExistingExemption[]) {
          ex[e.student_id] = e.reason
          exFlags[e.student_id] = true
        }
        setExemptions(ex)
        setExempted(exFlags)
      }
      setLoadingStudents(false)
    }
    load()
  }, [selectedClass, selectedSubject, selectedAssessment, selectedTerm])

  const handleSave = async () => {
    if (!selectedClass || !selectedSubject || !selectedAssessment || !teacherId || !schoolId || !selectedTerm) return
    setSaving(true)

    const gradeRows: any[] = []
    const exemptionRows: any[] = []
    const exemptStudentIds: string[] = []

    for (const s of students) {
      if (exempted[s.id]) {
        exemptStudentIds.push(s.id)
        exemptionRows.push({
          school_id: schoolId,
          student_id: s.id,
          subject_id: selectedSubject,
          term_label: selectedTerm,
          teacher_id: teacherId,
          reason: exemptions[s.id] || 'Other',
        })
      } else if (scores[s.id] !== undefined && scores[s.id] !== '') {
        const score = parseFloat(scores[s.id])
        if (!isNaN(score) && score >= 0 && score <= 100) {
          gradeRows.push({
            school_id: schoolId,
            class_id: selectedClass,
            student_id: s.id,
            subject_id: selectedSubject,
            teacher_id: teacherId,
            assessment_type_id: selectedAssessment,
            term_label: selectedTerm,
            score,
          })
        }
      }
    }

    let hasError = false

    if (gradeRows.length > 0) {
      const { error } = await supabase.from('grades').upsert(gradeRows, {
        onConflict: 'student_id,subject_id,assessment_type_id,term_label',
      })
      if (error) { show(error.message, 'error'); hasError = true }
    }

    if (exemptionRows.length > 0) {
      const { error } = await supabase.from('grade_exemptions').upsert(exemptionRows, {
        onConflict: 'student_id,subject_id,term_label',
      })
      if (error) { show(error.message, 'error'); hasError = true }
    }

    // Remove exemptions for students no longer exempted
    const prevExempted = Object.keys(exempted).filter(id => exempted[id])
    const toRemoveExemptions = prevExempted.filter(id => !exemptStudentIds.includes(id))
    if (toRemoveExemptions.length > 0) {
      await supabase.from('grade_exemptions')
        .delete()
        .eq('subject_id', selectedSubject)
        .eq('term_label', selectedTerm)
        .in('student_id', toRemoveExemptions)
    }

    if (!hasError) show(t('grades.saved'), 'success')
    setSaving(false)
  }

  if (loading) return (
    <div className="card">
      <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 60, width: '100%', borderRadius: 8, marginTop: 12 }} />
    </div>
  )

  if (role !== 'teacher' && role !== 'school_admin') {
    return <div className="card"><h2 style={{ marginTop: 0 }}>{t('grades.title')}</h2><p className="helper">{t('grades.noAssignments')}</p></div>
  }

  const createAssessment = async () => {
    if (!newAssessmentName.trim() || !schoolId) return
    const weight = parseFloat(newAssessmentWeight)
    if (isNaN(weight) || weight <= 0 || weight > 100) {
      show('Weight must be between 0 and 100.', 'error')
      return
    }
    setCreatingAssessment(true)
    const { data, error } = await supabase.from('assessment_types').insert({
      school_id: schoolId,
      name: newAssessmentName.trim(),
      weight,
      term_label: newAssessmentTerm.trim() || 'Term 1',
      is_active: true,
    }).select('id, name, weight, term_label').single()
    if (error) {
      show(error.message, 'error')
    } else if (data) {
      setAssessmentTypes(prev => [...prev, data])
      setSelectedTerm(data.term_label)
      setSelectedAssessment(data.id)
      setNewAssessmentName('')
      setShowNewAssessment(false)
      show('Assessment created', 'success')
    }
    setCreatingAssessment(false)
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('grades.title')}</h2>

        {assignments.length === 0 && role === 'teacher' ? (
          <div className="empty">{t('grades.noAssignments')}</div>
        ) : (
          <>
            {/* Selectors */}
            <div className="grid cols-4" style={{ gap: 12, marginBottom: 16 }}>
              <div>
                <label className="helper">{t('grades.selectClass')}</label>
                <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedSubject('') }}>
                  <option value="">—</option>
                  {uniqueClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="helper">{t('grades.selectSubject')}</label>
                <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} disabled={!selectedClass}>
                  <option value="">—</option>
                  {classSubjects.map(cs => <option key={cs.subject_id} value={cs.subject_id}>{cs.subject_name}</option>)}
                </select>
              </div>
              <div>
                <label className="helper">{t('assessments.term')}</label>
                <select value={selectedTerm} onChange={e => { setSelectedTerm(e.target.value); setSelectedAssessment('') }}>
                  <option value="">—</option>
                  {terms.map(tm => <option key={tm} value={tm}>{tm}</option>)}
                </select>
              </div>
              <div>
                <label className="helper">{t('grades.selectAssessment')}</label>
                <select value={selectedAssessment} onChange={e => setSelectedAssessment(e.target.value)} disabled={!selectedTerm}>
                  <option value="">—</option>
                  {termAssessments.map(a => <option key={a.id} value={a.id}>{a.name} ({a.weight}%)</option>)}
                </select>
              </div>
            </div>

            {/* Inline create-assessment for teacher/admin */}
            <div style={{ marginBottom: 12 }}>
              {!showNewAssessment ? (
                <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setShowNewAssessment(true)}>
                  + New assessment / assignment
                </button>
              ) : (
                <div className="card" style={{ background: 'var(--bg)', padding: 12 }}>
                  <p className="helper" style={{ margin: '0 0 8px 0' }}>Create a new assessment (e.g. "Quiz 1", "Midterm", "Project")</p>
                  <div className="grid cols-3" style={{ gap: 8 }}>
                    <input
                      placeholder="Name (e.g. Quiz 1)"
                      value={newAssessmentName}
                      onChange={e => setNewAssessmentName(e.target.value)}
                    />
                    <input
                      type="number" min="0" max="100" step="1"
                      placeholder="Weight %"
                      value={newAssessmentWeight}
                      onChange={e => setNewAssessmentWeight(e.target.value)}
                    />
                    <input
                      placeholder="Term (e.g. Term 1)"
                      value={newAssessmentTerm}
                      onChange={e => setNewAssessmentTerm(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary" onClick={createAssessment} disabled={creatingAssessment || !newAssessmentName.trim()}>
                      {creatingAssessment ? <LoadingSpinner size="sm" /> : 'Create'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => { setShowNewAssessment(false); setNewAssessmentName('') }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Grade entry table */}
            {!selectedClass || !selectedSubject || !selectedAssessment || !selectedTerm ? (
              <div className="empty">{t('grades.enterScores')}</div>
            ) : loadingStudents ? (
              <div style={{ textAlign: 'center', padding: 24 }}><LoadingSpinner size="md" /></div>
            ) : students.length === 0 ? (
              <div className="empty">{t('grades.noStudents')}</div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t('grades.student')}</th>
                        <th style={{ width: 120 }}>{t('grades.score')}</th>
                        <th style={{ width: 80 }}>{t('grades.exempt')}</th>
                        <th>{t('grades.exemptReason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, i) => (
                        <tr key={s.id} style={{ opacity: exempted[s.id] ? 0.6 : 1 }}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 500 }}>{s.first_name} {s.last_name}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={scores[s.id] ?? ''}
                              onChange={e => setScores(prev => ({ ...prev, [s.id]: e.target.value }))}
                              disabled={!!exempted[s.id]}
                              style={{ width: 80, padding: '6px 8px' }}
                              placeholder="0-100"
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!exempted[s.id]}
                              onChange={e => {
                                setExempted(prev => ({ ...prev, [s.id]: e.target.checked }))
                                if (e.target.checked) setScores(prev => { const n = { ...prev }; delete n[s.id]; return n })
                              }}
                              style={{ width: 18, height: 18, cursor: 'pointer' }}
                            />
                          </td>
                          <td>
                            {exempted[s.id] && (
                              <select
                                value={exemptions[s.id] ?? ''}
                                onChange={e => setExemptions(prev => ({ ...prev, [s.id]: e.target.value }))}
                                style={{ padding: '6px 8px', fontSize: 13 }}
                              >
                                <option value="">—</option>
                                {EXEMPT_REASONS.map(r => (
                                  <option key={r.key} value={t(r.label)}>{t(r.label)}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? <><LoadingSpinner size="sm" /> {t('grades.saving')}</> : t('grades.save')}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
