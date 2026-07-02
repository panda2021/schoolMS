import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { useFeature } from '@/ui/features/FeatureProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { useLanguage } from '@/i18n/LanguageProvider'
import { AlertTriangle, CheckCircle2, Printer } from 'lucide-react'

interface ClassOption { id: string; name: string; grade_level: string | null }
interface StudentOption { id: string; first_name: string; last_name: string }
interface AssessmentType { id: string; name: string; weight: number; term_label: string }
interface MissingGrade { teacher_name: string; subject_name: string; missing_count: number }

interface StudentReportCard {
  student_id: string
  student_name: string
  class_name: string
  subjects: {
    name: string
    name_am: string | null
    assessments: { name: string; score: number | null }[]
    weighted_avg: number | null
    exempted: boolean
    exempt_reason: string | null
  }[]
  overall_avg: number | null
  rank: number | null
  total_students: number
}

type Scope = 'student' | 'class' | 'school'

export default function ReportCards() {
  const { show } = useToast()
  const { can } = useFeature()
  const { t, language } = useLanguage()
  const printRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [schoolName, setSchoolName] = useState('')
  const [role, setRole] = useState<string | null>(null)

  // Selectors
  const [scope, setScope] = useState<Scope>('class')
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [students, setStudents] = useState<StudentOption[]>([])
  const [selectedStudent, setSelectedStudent] = useState('')
  const [terms, setTerms] = useState<string[]>([])
  const [selectedTerm, setSelectedTerm] = useState('')

  // Results
  const [checking, setChecking] = useState(false)
  const [missingGrades, setMissingGrades] = useState<MissingGrade[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [reportCards, setReportCards] = useState<StudentReportCard[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
      setRole(me?.role_key ?? null)
      setSchoolId(me?.school_id ?? null)

      if (me?.school_id) {
        const { data: school } = await supabase.from('schools').select('name').eq('id', me.school_id).single()
        setSchoolName(school?.name ?? '')

        const { data: cls } = await supabase.from('classes').select('id, name, grade_level').is('deleted_at', null).order('name')
        setClasses(cls ?? [])

        const { data: at } = await supabase.from('assessment_types').select('term_label').eq('is_active', true)
        setTerms([...new Set((at ?? []).map(a => a.term_label))])
      }
      setLoading(false)
    }
    init()
  }, [])

  // Load students when class selected
  useEffect(() => {
    if (!selectedClass) { setStudents([]); setSelectedStudent(''); return }
    const load = async () => {
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('student_id, students(id, first_name, last_name)')
        .eq('class_id', selectedClass)
        .is('deleted_at', null)
      const studs = (enrolls ?? []).map((e: any) => ({
        id: e.students?.id ?? e.student_id,
        first_name: e.students?.first_name ?? '',
        last_name: e.students?.last_name ?? '',
      }))
      studs.sort((a: StudentOption, b: StudentOption) => a.first_name.localeCompare(b.first_name))
      setStudents(studs)
    }
    load()
  }, [selectedClass])

  const getTargetClassIds = (): string[] => {
    if (scope === 'school') return classes.map(c => c.id)
    if (scope === 'class' && selectedClass) return [selectedClass]
    if (scope === 'student' && selectedClass) return [selectedClass]
    return []
  }

  // Check readiness
  const checkReadiness = async () => {
    if (!selectedTerm) { show('Select a term first', 'error'); return }
    const classIds = getTargetClassIds()
    if (classIds.length === 0) { show('Select a class', 'error'); return }

    setChecking(true)
    setMissingGrades(null)
    setReportCards([])

    const missing: MissingGrade[] = []

    for (const classId of classIds) {
      // Get subject-teacher assignments for this class
      const { data: cst } = await supabase
        .from('class_subject_teachers')
        .select('subject_id, teacher_id, subjects(name), teachers(users(full_name))')
        .eq('class_id', classId)

      // Get enrolled students
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('student_id')
        .eq('class_id', classId)
        .is('deleted_at', null)
      const studentIds = (enrolls ?? []).map(e => e.student_id)
      if (studentIds.length === 0) continue

      // Get assessment types for this term
      const { data: at } = await supabase
        .from('assessment_types')
        .select('id')
        .eq('term_label', selectedTerm)
        .eq('is_active', true)
      const atIds = (at ?? []).map(a => a.id)

      for (const assignment of (cst ?? []) as any[]) {
        // Count grades submitted
        const { count: gradeCount } = await supabase
          .from('grades')
          .select('*', { count: 'exact', head: true })
          .eq('subject_id', assignment.subject_id)
          .eq('term_label', selectedTerm)
          .in('student_id', studentIds)
          .in('assessment_type_id', atIds)

        // Count exemptions
        const { count: exemptCount } = await supabase
          .from('grade_exemptions')
          .select('*', { count: 'exact', head: true })
          .eq('subject_id', assignment.subject_id)
          .eq('term_label', selectedTerm)
          .in('student_id', studentIds)

        const expected = studentIds.length * atIds.length
        const actual = (gradeCount ?? 0) + ((exemptCount ?? 0) * atIds.length)

        if (actual < expected) {
          const missingStudents = Math.ceil((expected - actual) / Math.max(atIds.length, 1))
          missing.push({
            teacher_name: assignment.teachers?.users?.full_name ?? 'Unknown',
            subject_name: assignment.subjects?.name ?? 'Unknown',
            missing_count: missingStudents,
          })
        }
      }
    }

    setMissingGrades(missing)
    setChecking(false)
  }

  // Generate report cards
  const generateReportCards = async () => {
    if (!selectedTerm) return
    const classIds = getTargetClassIds()
    if (classIds.length === 0) return

    setGenerating(true)
    setReportCards([])

    // Load assessment types for term
    const { data: atData } = await supabase
      .from('assessment_types')
      .select('id, name, weight, term_label')
      .eq('term_label', selectedTerm)
      .eq('is_active', true)
      .order('name')
    const assessments: AssessmentType[] = atData ?? []

    const allCards: StudentReportCard[] = []

    for (const classId of classIds) {
      const cls = classes.find(c => c.id === classId)
      if (!cls) continue

      // Get subjects for this class
      const { data: cst } = await supabase
        .from('class_subject_teachers')
        .select('subject_id, subjects(name, name_am)')
        .eq('class_id', classId)
      const subjectMap = new Map<string, { name: string; name_am: string | null }>()
      for (const row of (cst ?? []) as any[]) {
        subjectMap.set(row.subject_id, { name: row.subjects?.name ?? '', name_am: row.subjects?.name_am ?? null })
      }

      // Get enrolled students
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('student_id, students(id, first_name, last_name)')
        .eq('class_id', classId)
        .is('deleted_at', null)
      const studs = (enrolls ?? []).map((e: any) => ({
        id: e.students?.id ?? e.student_id,
        first_name: e.students?.first_name ?? '',
        last_name: e.students?.last_name ?? '',
      }))

      // Filter for specific student if scope is student
      const targetStudents = scope === 'student' && selectedStudent
        ? studs.filter(s => s.id === selectedStudent)
        : studs

      if (targetStudents.length === 0) continue
      const studentIds = studs.map(s => s.id) // use all students for ranking

      // Get all grades for this class/term
      const { data: gradesData } = await supabase
        .from('grades')
        .select('student_id, subject_id, assessment_type_id, score')
        .eq('class_id', classId)
        .eq('term_label', selectedTerm)
        .in('student_id', studentIds)

      // Get all exemptions
      const { data: exemptData } = await supabase
        .from('grade_exemptions')
        .select('student_id, subject_id, reason')
        .eq('term_label', selectedTerm)
        .in('student_id', studentIds)

      // Build grade lookup: student -> subject -> assessment -> score
      const gradeLookup = new Map<string, Map<string, Map<string, number>>>()
      for (const g of (gradesData ?? []) as any[]) {
        if (!gradeLookup.has(g.student_id)) gradeLookup.set(g.student_id, new Map())
        const subMap = gradeLookup.get(g.student_id)!
        if (!subMap.has(g.subject_id)) subMap.set(g.subject_id, new Map())
        subMap.get(g.subject_id)!.set(g.assessment_type_id, g.score)
      }

      // Exemption lookup: student -> subject -> reason
      const exemptLookup = new Map<string, Map<string, string>>()
      for (const e of (exemptData ?? []) as any[]) {
        if (!exemptLookup.has(e.student_id)) exemptLookup.set(e.student_id, new Map())
        exemptLookup.get(e.student_id)!.set(e.subject_id, e.reason)
      }

      // Compute report cards for ALL students (for ranking), then filter
      const classCards: { student_id: string; overall_avg: number | null; card: StudentReportCard }[] = []

      for (const student of studs) {
        const subjects: StudentReportCard['subjects'] = []
        const subjectAvgs: number[] = []

        for (const [subjectId, subjectInfo] of subjectMap) {
          const isExempt = exemptLookup.get(student.id)?.has(subjectId) ?? false
          const exemptReason = exemptLookup.get(student.id)?.get(subjectId) ?? null

          const assessmentScores = assessments.map(a => {
            const score = gradeLookup.get(student.id)?.get(subjectId)?.get(a.id) ?? null
            return { name: a.name, score }
          })

          let weightedAvg: number | null = null
          if (!isExempt) {
            let totalWeight = 0
            let totalScore = 0
            for (const a of assessments) {
              const score = gradeLookup.get(student.id)?.get(subjectId)?.get(a.id)
              if (score !== undefined && score !== null) {
                totalScore += score * a.weight
                totalWeight += a.weight
              }
            }
            weightedAvg = totalWeight > 0 ? totalScore / totalWeight : null
            if (weightedAvg !== null) subjectAvgs.push(weightedAvg)
          }

          subjects.push({
            name: subjectInfo.name,
            name_am: subjectInfo.name_am,
            assessments: assessmentScores,
            weighted_avg: weightedAvg !== null ? Math.round(weightedAvg * 10) / 10 : null,
            exempted: isExempt,
            exempt_reason: exemptReason,
          })
        }

        const overallAvg = subjectAvgs.length > 0
          ? Math.round((subjectAvgs.reduce((a, b) => a + b, 0) / subjectAvgs.length) * 10) / 10
          : null

        classCards.push({
          student_id: student.id,
          overall_avg: overallAvg,
          card: {
            student_id: student.id,
            student_name: `${student.first_name} ${student.last_name}`,
            class_name: cls.name,
            subjects,
            overall_avg: overallAvg,
            rank: null,
            total_students: studs.length,
          },
        })
      }

      // Compute ranks
      const ranked = [...classCards].filter(c => c.overall_avg !== null).sort((a, b) => (b.overall_avg ?? 0) - (a.overall_avg ?? 0))
      ranked.forEach((c, i) => { c.card.rank = i + 1 })

      // Push only target students
      for (const cc of classCards) {
        if (targetStudents.some(s => s.id === cc.student_id)) {
          allCards.push(cc.card)
        }
      }
    }

    setReportCards(allCards)
    setGenerating(false)
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) return (
    <div className="card">
      <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 8 }} />
    </div>
  )

  if (role !== 'school_admin' || !can('report_cards.view')) {
    return <div className="card"><h2>{t('reportCards.title')}</h2><p className="helper">Admin only.</p></div>
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* Controls (hidden when printing) */}
      <div className="card no-print">
        <h2 style={{ marginTop: 0 }}>{t('reportCards.title')}</h2>

        {/* Scope tabs */}
        <div className="tabs" style={{ marginBottom: 16 }}>
          {(['class', 'student', 'school'] as Scope[]).map(s => (
            <button key={s} className={`tab ${scope === s ? 'active' : ''}`} onClick={() => { setScope(s); setReportCards([]); setMissingGrades(null) }}>
              {s === 'class' ? t('reportCards.perClass') : s === 'student' ? t('reportCards.perStudent') : t('reportCards.perSchool')}
            </button>
          ))}
        </div>

        {/* Selectors */}
        <div className="grid cols-3" style={{ gap: 12, marginBottom: 16 }}>
          <div>
            <label className="helper">{t('reportCards.selectTerm')}</label>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">—</option>
              {terms.map(tm => <option key={tm} value={tm}>{tm}</option>)}
            </select>
          </div>
          {scope !== 'school' && (
            <div>
              <label className="helper">{t('reportCards.selectClass')}</label>
              <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedStudent('') }}>
                <option value="">—</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {scope === 'student' && (
            <div>
              <label className="helper">{t('reportCards.selectStudent')}</label>
              <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} disabled={!selectedClass}>
                <option value="">—</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-secondary" onClick={checkReadiness} disabled={checking || !selectedTerm}>
            {checking ? <><LoadingSpinner size="sm" /> Checking...</> : t('reportCards.checkReadiness')}
          </button>
          <button className="btn btn-primary" onClick={generateReportCards} disabled={generating || !selectedTerm}>
            {generating ? <><LoadingSpinner size="sm" /> Generating...</> : t('reportCards.generate')}
          </button>
          {reportCards.length > 0 && (
            <button className="btn btn-secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={14} /> {t('reportCards.print')}
            </button>
          )}
        </div>

        {/* Missing grades warnings */}
        {missingGrades !== null && (
          <div style={{ marginBottom: 16 }}>
            {missingGrades.length === 0 ? (
              <div className="badge badge-success" style={{ padding: '8px 12px', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <CheckCircle2 size={14} /> {t('reportCards.allReady')}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, color: '#b91c1c' }}>
                  <AlertTriangle size={16} /> {t('reportCards.missingGrades')}
                </div>
                {missingGrades.map((m, i) => (
                  <div key={i} className="badge" style={{ color: '#991b1b', background: '#fef2f2', borderColor: '#fecaca', padding: '6px 10px' }}>
                    <strong>{m.teacher_name}</strong> — {m.subject_name}: {t('reportCards.missingWarning')} {m.missing_count} {t('reportCards.students')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Report Cards (printable) */}
      {reportCards.length > 0 && (
        <div ref={printRef}>
          {reportCards.map((rc, idx) => (
            <div key={idx} className="report-card card" style={{ padding: 24, marginBottom: 16 }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{schoolName}</h2>
                <h3 style={{ margin: '4px 0', fontWeight: 500, fontSize: 16, color: 'var(--muted)' }}>{t('reportCards.reportCard')}</h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8, fontSize: 14 }}>
                  <span><strong>{t('grades.student')}:</strong> {rc.student_name}</span>
                  <span><strong>{t('attendance.class')}:</strong> {rc.class_name}</span>
                  <span><strong>{t('assessments.term')}:</strong> {selectedTerm}</span>
                </div>
              </div>

              {/* Grades table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                      {t('reportCards.subject')}
                    </th>
                    {rc.subjects[0]?.assessments.map((a, i) => (
                      <th key={i} style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid var(--border)' }}>
                        {a.name}
                      </th>
                    ))}
                    <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid var(--border)', fontWeight: 700 }}>
                      {t('reportCards.weightedAvg')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rc.subjects.map((sub, si) => (
                    <tr key={si} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 500 }}>
                        {language === 'am' && sub.name_am ? sub.name_am : sub.name}
                      </td>
                      {sub.assessments.map((a, ai) => (
                        <td key={ai} style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {sub.exempted ? <span style={{ color: 'var(--muted)' }}>EX</span> : a.score !== null ? a.score : '-'}
                        </td>
                      ))}
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {sub.exempted ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>—</span> : sub.weighted_avg !== null ? sub.weighted_avg : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8 }}>
                <div>
                  <strong>{t('reportCards.overallAvg')}:</strong>{' '}
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{rc.overall_avg !== null ? rc.overall_avg : '-'}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}> / 100</span>
                </div>
                {rc.rank !== null && (
                  <div>
                    <strong>{t('reportCards.rank')}:</strong>{' '}
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{rc.rank}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}> / {rc.total_students}</span>
                  </div>
                )}
              </div>

              {/* Exemptions note */}
              {rc.subjects.filter(s => s.exempted).length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                  <strong>{t('reportCards.exempted')}:</strong>{' '}
                  {rc.subjects.filter(s => s.exempted).map(s =>
                    `${language === 'am' && s.name_am ? s.name_am : s.name} (${s.exempt_reason ?? ''})`
                  ).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!generating && reportCards.length === 0 && missingGrades === null && (
        <div className="card">
          <div className="empty">{t('reportCards.noData')}</div>
        </div>
      )}
    </div>
  )
}
