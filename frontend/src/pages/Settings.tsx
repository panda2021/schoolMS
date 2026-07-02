import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useTheme } from '@/ui/theme/ThemeProvider'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { Trash2, Pencil } from 'lucide-react'

const GRADES = ['KG', '1', '2', '3', '4', '5', '6', '7', '8']

interface Subject {
  id: string
  name: string
  name_am: string | null
  grade_levels: string[]
  is_default: boolean
}

interface AssessmentType {
  id: string
  name: string
  weight: number
  term_label: string
  is_active: boolean
}

export default function Settings() {
  const [profile, setProfile] = useState<any>(null)
  const [schoolId, _setSchoolId] = useState<string | null>(null)
  const schoolIdRef = useRef<string | null>(null)
  const setSchoolId = (v: string | null) => { schoolIdRef.current = v; _setSchoolId(v) }
  const [role, setRole] = useState<string | null>(null)
  const { theme, setTheme } = useTheme()
  const { language, setLanguage, t } = useLanguage()
  const { show } = useToast()

  // Subjects
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [showAddSubject, setShowAddSubject] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [newSubNameAm, setNewSubNameAm] = useState('')
  const [newSubGrades, setNewSubGrades] = useState<string[]>([])
  const [savingSubject, setSavingSubject] = useState(false)

  // Inline subject editing (Phase 4 curriculum editor)
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null)
  const [editSubName, setEditSubName] = useState('')
  const [editSubNameAm, setEditSubNameAm] = useState('')
  const [editSubGrades, setEditSubGrades] = useState<string[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  // Assessment Types
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([])
  const [loadingAT, setLoadingAT] = useState(false)
  const [showAddAT, setShowAddAT] = useState(false)
  const [newATName, setNewATName] = useState('')
  const [newATWeight, setNewATWeight] = useState('')
  const [newATTerm, setNewATTerm] = useState('')
  const [savingAT, setSavingAT] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('users').select('full_name, language_preference, role_key, school_id').eq('id', user.id).maybeSingle()
      setProfile(data)
      setRole(data?.role_key ?? null)

      let sid = data?.school_id ?? null
      // Fallback: if school_id is null, try to find it from schools table (admin may be linked differently)
      if (!sid && data?.role_key === 'school_admin') {
        const { data: schoolData } = await supabase.from('schools').select('id').is('deleted_at', null).limit(1).single()
        sid = schoolData?.id ?? null
      }
      setSchoolId(sid)

      if (data?.role_key === 'school_admin' && sid) {
        loadSubjects()
        loadAssessmentTypes()
      }
    }
    load()
  }, [])

  const isAdmin = role === 'school_admin'

  // ─── Subjects ───
  const loadSubjects = async () => {
    setLoadingSubjects(true)
    const { data } = await supabase
      .from('subjects')
      .select('id, name, name_am, grade_levels, is_default')
      .is('deleted_at', null)
      .order('name')
    setSubjects(data ?? [])
    setLoadingSubjects(false)
  }

  const seedDefaults = async () => {
    const sid = schoolIdRef.current
    if (!sid) {
      show('School ID not found — reload the page', 'error')
      return
    }
    setSavingSubject(true)

    const defaults = [
      { name: 'Amharic', name_am: 'አማርኛ', grade_levels: ['KG','1','2','3','4','5','6','7','8'] },
      { name: 'English', name_am: 'እንግሊዝኛ', grade_levels: ['KG','1','2','3','4','5','6','7','8'] },
      { name: 'Mathematics', name_am: 'ሒሳብ', grade_levels: ['KG','1','2','3','4','5','6','7','8'] },
      { name: 'Environmental Science', name_am: 'የአካባቢ ሳይንስ', grade_levels: ['KG','1','2','3','4'] },
      { name: 'Art', name_am: 'ስነ ጥበብ', grade_levels: ['KG','1','2','3','4'] },
      { name: 'Civics', name_am: 'ዜግነት', grade_levels: ['1','2','3','4','5','6','7','8'] },
      { name: 'Physical Education', name_am: 'አካላዊ ትምህርት', grade_levels: ['1','2','3','4','5','6','7','8'] },
      { name: 'Biology', name_am: 'ስነ ህይወት', grade_levels: ['5','6','7','8'] },
      { name: 'Chemistry', name_am: 'ኬሚስትሪ', grade_levels: ['5','6','7','8'] },
      { name: 'Physics', name_am: 'ፊዚክስ', grade_levels: ['5','6','7','8'] },
      { name: 'History', name_am: 'ታሪክ', grade_levels: ['5','6','7','8'] },
      { name: 'Geography', name_am: 'ጂኦግራፊ', grade_levels: ['5','6','7','8'] },
      { name: 'ICT', name_am: 'አይሲቲ', grade_levels: ['5','6','7','8'] },
    ]

    const rows = defaults.map(d => ({
      school_id: sid,
      name: d.name,
      name_am: d.name_am,
      grade_levels: d.grade_levels,
      is_default: true,
    }))

    let inserted = 0
    let skipped = 0
    for (const row of rows) {
      const { error } = await supabase.from('subjects').insert(row)
      if (error) {
        if (error.code === '23505') { skipped++; continue } // duplicate — skip
        show(error.message, 'error')
        setSavingSubject(false)
        return
      }
      inserted++
    }
    show(`${t('subjects.seeded')} (${inserted} added, ${skipped} already existed)`, 'success')
    loadSubjects()
    setSavingSubject(false)
  }

  const addSubject = async () => {
    const sid = schoolIdRef.current
    if (!newSubName.trim() || newSubGrades.length === 0 || !sid) return
    setSavingSubject(true)
    const { error } = await supabase.from('subjects').insert({
      school_id: sid,
      name: newSubName.trim(),
      name_am: newSubNameAm.trim() || null,
      grade_levels: newSubGrades,
      is_default: false,
    })
    if (error) show(error.message, 'error')
    else {
      show('Subject added', 'success')
      setNewSubName(''); setNewSubNameAm(''); setNewSubGrades([]); setShowAddSubject(false)
      loadSubjects()
    }
    setSavingSubject(false)
  }

  const deleteSubject = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? It disappears from grade entry and class assignments; already-recorded grades keep their history.`)) return
    const { error } = await supabase.from('subjects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) show(error.message, 'error')
    else show('Subject deleted', 'success')
    loadSubjects()
  }

  const startEditSubject = (s: Subject) => {
    setEditingSubjectId(s.id)
    setEditSubName(s.name)
    setEditSubNameAm(s.name_am ?? '')
    setEditSubGrades([...s.grade_levels])
  }

  const toggleEditGrade = (g: string) => {
    setEditSubGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  const saveSubjectEdit = async () => {
    if (!editingSubjectId || !editSubName.trim() || editSubGrades.length === 0) return
    setSavingEdit(true)
    // Keep grade order canonical (KG, 1..8) regardless of click order
    const ordered = GRADES.filter(g => editSubGrades.includes(g))
    const { error } = await supabase.from('subjects').update({
      name: editSubName.trim(),
      name_am: editSubNameAm.trim() || null,
      grade_levels: ordered,
      updated_at: new Date().toISOString(),
    }).eq('id', editingSubjectId)
    if (error) show(error.message, 'error')
    else {
      show('Subject updated', 'success')
      setEditingSubjectId(null)
      loadSubjects()
    }
    setSavingEdit(false)
  }

  // ─── Assessment Types ───
  const loadAssessmentTypes = async () => {
    setLoadingAT(true)
    const { data } = await supabase
      .from('assessment_types')
      .select('id, name, weight, term_label, is_active')
      .order('term_label')
      .order('name')
    setAssessmentTypes(data ?? [])
    setLoadingAT(false)
  }

  const addAssessmentType = async () => {
    const sid = schoolIdRef.current
    if (!newATName.trim() || !newATWeight || !newATTerm.trim() || !sid) return
    setSavingAT(true)
    const { error } = await supabase.from('assessment_types').insert({
      school_id: sid,
      name: newATName.trim(),
      weight: parseFloat(newATWeight),
      term_label: newATTerm.trim(),
    })
    if (error) show(error.message, 'error')
    else {
      show('Assessment type added', 'success')
      setNewATName(''); setNewATWeight(''); setNewATTerm(''); setShowAddAT(false)
      loadAssessmentTypes()
    }
    setSavingAT(false)
  }

  const toggleATActive = async (id: string, current: boolean) => {
    await supabase.from('assessment_types').update({ is_active: !current }).eq('id', id)
    loadAssessmentTypes()
  }

  const deleteAT = async (id: string) => {
    if (!confirm('Delete this assessment type?')) return
    await supabase.from('assessment_types').delete().eq('id', id)
    loadAssessmentTypes()
  }

  // Weight check per term
  const termWeights = assessmentTypes.reduce<Record<string, number>>((acc, at) => {
    if (at.is_active) acc[at.term_label] = (acc[at.term_label] || 0) + at.weight
    return acc
  }, {})

  const toggleGrade = (g: string) => {
    setNewSubGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* General Settings */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('settings.title')}</h2>
        {!profile ? (
          <div className="skeleton" style={{ height: 18, width: 220, borderRadius: 8 }} />
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label>{t('settings.account')}</label>
              <div className="badge">{profile.full_name ?? 'User'} — {profile.role_key}</div>
            </div>
            <div>
              <label>{t('settings.theme')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setTheme('light')} disabled={theme==='light'}>{t('settings.light')}</button>
                <button className="btn btn-secondary" onClick={() => setTheme('dark')} disabled={theme==='dark'}>{t('settings.dark')}</button>
              </div>
            </div>
            <div>
              <label>{t('settings.language')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setLanguage('en')} disabled={language==='en'}>{t('settings.english')}</button>
                <button className="btn btn-secondary" onClick={() => setLanguage('am')} disabled={language==='am'}>{t('settings.amharic')}</button>
              </div>
              <div className="helper">{t('settings.current')}: {language === 'en' ? 'English' : 'Amharic'}</div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Subjects Management (Admin only) ─── */}
      {isAdmin && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>{t('subjects.title')}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={seedDefaults} disabled={savingSubject}>
                {savingSubject ? <LoadingSpinner size="sm" /> : t('subjects.seedDefaults')}
              </button>
              <button className="btn btn-primary" onClick={() => setShowAddSubject(!showAddSubject)}>
                {t('subjects.add')}
              </button>
            </div>
          </div>

          {showAddSubject && (
            <div className="card" style={{ background: 'var(--bg)', marginBottom: 12, padding: 16 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="grid cols-2" style={{ gap: 10 }}>
                  <div>
                    <label className="helper">{t('subjects.name')}</label>
                    <input value={newSubName} onChange={e => setNewSubName(e.target.value)} placeholder="e.g. Mathematics" />
                  </div>
                  <div>
                    <label className="helper">{t('subjects.nameAm')}</label>
                    <input value={newSubNameAm} onChange={e => setNewSubNameAm(e.target.value)} placeholder="e.g. ሒሳብ" />
                  </div>
                </div>
                <div>
                  <label className="helper">{t('subjects.gradeLevels')}</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {GRADES.map(g => (
                      <button
                        key={g}
                        className={`badge ${newSubGrades.includes(g) ? 'badge-success' : ''}`}
                        onClick={() => toggleGrade(g)}
                        style={{ cursor: 'pointer', padding: '4px 10px' }}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={addSubject} disabled={savingSubject || !newSubName.trim() || newSubGrades.length === 0}>
                    {savingSubject ? <LoadingSpinner size="sm" /> : t('common.save')}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowAddSubject(false)}>{t('common.cancel')}</button>
                </div>
              </div>
            </div>
          )}

          {loadingSubjects ? (
            <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
          ) : subjects.length === 0 ? (
            <div className="empty">{t('subjects.noSubjects')}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('subjects.name')}</th>
                    <th>{t('subjects.nameAm')}</th>
                    <th>{t('subjects.gradeLevels')}</th>
                    <th style={{ width: 84 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(s => (
                    editingSubjectId === s.id ? (
                      <tr key={s.id}>
                        <td colSpan={4} style={{ background: 'var(--bg)' }}>
                          <div style={{ display: 'grid', gap: 10, padding: '6px 0' }}>
                            <div className="grid cols-2" style={{ gap: 10 }}>
                              <div>
                                <label className="helper">{t('subjects.name')}</label>
                                <input value={editSubName} onChange={e => setEditSubName(e.target.value)} />
                              </div>
                              <div>
                                <label className="helper">{t('subjects.nameAm')}</label>
                                <input value={editSubNameAm} onChange={e => setEditSubNameAm(e.target.value)} />
                              </div>
                            </div>
                            <div>
                              <label className="helper">{t('subjects.gradeLevels')}</label>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                {GRADES.map(g => (
                                  <button
                                    key={g}
                                    className={`badge ${editSubGrades.includes(g) ? 'badge-success' : ''}`}
                                    onClick={() => toggleEditGrade(g)}
                                    style={{ cursor: 'pointer', padding: '4px 10px' }}
                                  >
                                    {g}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                className="btn btn-primary"
                                onClick={saveSubjectEdit}
                                disabled={savingEdit || !editSubName.trim() || editSubGrades.length === 0}
                              >
                                {savingEdit ? <LoadingSpinner size="sm" /> : t('common.save')}
                              </button>
                              <button className="btn btn-secondary" onClick={() => setEditingSubjectId(null)}>{t('common.cancel')}</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td>{s.name_am ?? '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {s.grade_levels.map(g => <span key={g} className="badge" style={{ fontSize: 11 }}>{g}</span>)}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 4, color: 'var(--primary)' }}
                              title={t('common.edit')}
                              onClick={() => startEditSubject(s)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: 4, color: 'var(--danger)' }}
                              title={t('common.delete')}
                              onClick={() => deleteSubject(s.id, s.name)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Assessment Types (Admin only) ─── */}
      {isAdmin && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>{t('assessments.title')}</h2>
            <button className="btn btn-primary" onClick={() => setShowAddAT(!showAddAT)}>
              {t('assessments.add')}
            </button>
          </div>

          {/* Weight warnings */}
          {Object.entries(termWeights).map(([term, total]) => (
            <div
              key={term}
              className="badge"
              style={{
                marginBottom: 8,
                marginRight: 8,
                display: 'inline-flex',
                gap: 6,
                ...(Math.abs(total - 100) < 0.01
                  ? { color: '#166534', background: '#dcfce7', borderColor: '#bbf7d0' }
                  : { color: '#991b1b', background: '#fef2f2', borderColor: '#fecaca' }),
              }}
            >
              {term}: {total.toFixed(0)}%
              {Math.abs(total - 100) < 0.01 ? ` — ${t('assessments.weightOk')}` : ` — ${t('assessments.weightWarning')}`}
            </div>
          ))}

          {showAddAT && (
            <div className="card" style={{ background: 'var(--bg)', marginBottom: 12, padding: 16 }}>
              <div className="grid cols-3" style={{ gap: 10 }}>
                <div>
                  <label className="helper">{t('assessments.name')}</label>
                  <input value={newATName} onChange={e => setNewATName(e.target.value)} placeholder="e.g. Midterm" />
                </div>
                <div>
                  <label className="helper">{t('assessments.weight')}</label>
                  <input type="number" value={newATWeight} onChange={e => setNewATWeight(e.target.value)} placeholder="e.g. 30" min="1" max="100" />
                </div>
                <div>
                  <label className="helper">{t('assessments.term')}</label>
                  <input value={newATTerm} onChange={e => setNewATTerm(e.target.value)} placeholder="e.g. 2026 Semester 1" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" onClick={addAssessmentType} disabled={savingAT || !newATName.trim() || !newATWeight || !newATTerm.trim()}>
                  {savingAT ? <LoadingSpinner size="sm" /> : t('common.save')}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowAddAT(false)}>{t('common.cancel')}</button>
              </div>
            </div>
          )}

          {loadingAT ? (
            <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
          ) : assessmentTypes.length === 0 ? (
            <div className="empty">{t('assessments.noTypes')}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('assessments.term')}</th>
                    <th>{t('assessments.name')}</th>
                    <th>{t('assessments.weight')}</th>
                    <th>{t('assessments.active')}</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {assessmentTypes.map(at => (
                    <tr key={at.id} style={{ opacity: at.is_active ? 1 : 0.5 }}>
                      <td><span className="badge">{at.term_label}</span></td>
                      <td style={{ fontWeight: 500 }}>{at.name}</td>
                      <td>{at.weight}%</td>
                      <td>
                        <button
                          className={`badge ${at.is_active ? 'badge-success' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleATActive(at.id, at.is_active)}
                        >
                          {at.is_active ? 'On' : 'Off'}
                        </button>
                      </td>
                      <td>
                        <button className="btn btn-ghost" style={{ padding: 4, color: '#dc2626' }} onClick={() => deleteAT(at.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
