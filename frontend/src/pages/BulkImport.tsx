import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { useFeature } from '@/ui/features/FeatureProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { useLanguage } from '@/i18n/LanguageProvider'

type Tab = 'students' | 'classes'
type ImportStep = 'upload' | 'preview' | 'importing' | 'done'

interface ValidationError { row: number; field: string; message: string }

const STUDENT_COLUMNS = ['first_name', 'last_name', 'date_of_birth', 'gender', 'guardian_name', 'guardian_phone', 'emergency_contact', 'medical_notes', 'class_name']
const CLASS_COLUMNS = ['name', 'grade_level', 'teacher_name']

export default function BulkImport() {
  const { show } = useToast()
  const { can } = useFeature()
  const { t } = useLanguage()
  const [role, setRole] = useState<string | null>(null)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('students')
  const [step, setStep] = useState<ImportStep>('upload')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number; enrollFailed?: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase.from('users').select('role_key, school_id').eq('id', user.id).maybeSingle()
      setRole(me?.role_key ?? null)
      setSchoolId(me?.school_id ?? null)
    }
    init()
  }, [])

  const reset = () => {
    setStep('upload')
    setRows([])
    setErrors([])
    setResult(null)
  }

  const parseFile = async (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
        if (data.length === 0) { show('File is empty', 'error'); return }

        // Normalize column names (lowercase, trim, replace spaces with underscores)
        const normalized = data.map(row => {
          const clean: Record<string, string> = {}
          for (const [key, val] of Object.entries(row)) {
            clean[key.toLowerCase().trim().replace(/\s+/g, '_')] = String(val).trim()
          }
          return clean
        })

        setRows(normalized)
        const errs = tab === 'students' ? validateStudents(normalized) : validateClasses(normalized)
        setErrors(errs)
        setStep('preview')
      } catch {
        show('Failed to parse file', 'error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  const validateStudents = (data: Record<string, string>[]): ValidationError[] => {
    const errs: ValidationError[] = []
    data.forEach((row, i) => {
      if (!row.first_name?.trim()) errs.push({ row: i, field: 'first_name', message: 'Required' })
      if (!row.last_name?.trim()) errs.push({ row: i, field: 'last_name', message: 'Required' })
      if (row.gender && !['male', 'female'].includes(row.gender.toLowerCase())) {
        errs.push({ row: i, field: 'gender', message: 'Must be male or female' })
      }
      if (row.date_of_birth && isNaN(Date.parse(row.date_of_birth))) {
        errs.push({ row: i, field: 'date_of_birth', message: 'Invalid date' })
      }
    })
    return errs
  }

  const validateClasses = (data: Record<string, string>[]): ValidationError[] => {
    const errs: ValidationError[] = []
    data.forEach((row, i) => {
      if (!row.name?.trim()) errs.push({ row: i, field: 'name', message: 'Required' })
    })
    return errs
  }

  const importStudents = async () => {
    if (!schoolId) return
    setImporting(true)
    setStep('importing')
    let success = 0, failed = 0, enrollFailed = 0
    const batchSize = 50

    // Get existing classes for auto-enrollment
    const { data: existingClasses } = await supabase.from('classes').select('id, name').is('deleted_at', null)
    const classMap = new Map((existingClasses ?? []).map(c => [c.name.toLowerCase(), c.id]))

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const insertRows = batch.map(r => ({
        school_id: schoolId,
        first_name: r.first_name?.trim(),
        last_name: r.last_name?.trim(),
        date_of_birth: r.date_of_birth && !isNaN(Date.parse(r.date_of_birth)) ? r.date_of_birth : null,
        gender: r.gender && ['male', 'female'].includes(r.gender.toLowerCase()) ? r.gender.toLowerCase() : null,
        guardian_name: r.guardian_name?.trim() || null,
        guardian_phone: r.guardian_phone?.trim() || null,
        emergency_contact: r.emergency_contact?.trim() || null,
        medical_notes: r.medical_notes?.trim() || null,
      }))

      const { data: inserted, error } = await supabase.from('students').insert(insertRows).select('id')
      if (error) { failed += batch.length; continue }
      success += (inserted ?? []).length

      // Auto-enroll if class_name provided
      const enrollments: { school_id: string; class_id: string; student_id: string }[] = []
      batch.forEach((r, j) => {
        if (r.class_name && inserted?.[j]?.id) {
          const classId = classMap.get(r.class_name.toLowerCase())
          if (classId) {
            enrollments.push({ school_id: schoolId!, class_id: classId, student_id: inserted[j].id })
          }
        }
      })
      if (enrollments.length > 0) {
        const { error: enrollErr } = await supabase.from('enrollments').insert(enrollments)
        if (enrollErr) enrollFailed += enrollments.length
      }
    }

    setResult({ success, failed, enrollFailed })
    setStep('done')
    setImporting(false)
  }

  const importClasses = async () => {
    if (!schoolId) return
    setImporting(true)
    setStep('importing')
    let success = 0, failed = 0

    // Get teachers for name matching
    const { data: teacherData } = await supabase.from('teachers').select('id, users(full_name)').is('deleted_at', null)
    const teacherMap = new Map((teacherData ?? []).map((t: any) => [(t.users?.full_name ?? '').toLowerCase(), t.id]))

    const batchSize = 50
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const insertRows = batch.map(r => ({
        school_id: schoolId,
        name: r.name?.trim(),
        grade_level: r.grade_level?.trim() || null,
        teacher_id: r.teacher_name ? (teacherMap.get(r.teacher_name.toLowerCase()) ?? null) : null,
      }))

      const { data: inserted, error } = await supabase.from('classes').insert(insertRows).select('id')
      if (error) { failed += batch.length }
      else { success += (inserted ?? []).length }
    }

    setResult({ success, failed })
    setStep('done')
    setImporting(false)
  }

  const downloadTemplate = () => {
    const cols = tab === 'students' ? STUDENT_COLUMNS : CLASS_COLUMNS
    const ws = XLSX.utils.aoa_to_sheet([cols])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tab)
    XLSX.writeFile(wb, `${tab}_template.xlsx`)
  }

  const columns = tab === 'students' ? STUDENT_COLUMNS : CLASS_COLUMNS
  const rowErrors = (rowIdx: number) => errors.filter(e => e.row === rowIdx)
  const hasBlockingErrors = errors.some(e => ['first_name', 'last_name', 'name'].includes(e.field))

  if (role !== 'school_admin' || !can('import.use')) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('import.title')}</h2>
        <p className="helper">{t('import.adminOnly')}</p>
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('import.title')}</h2>
        <p className="helper" style={{ marginBottom: 12 }}>{t('import.subtitle')}</p>

        {/* Tabs */}
        <div className="tab-bar">
          {(['students', 'classes'] as Tab[]).map(tb => (
            <button key={tb} className={`tab-btn ${tab === tb ? 'active' : ''}`} onClick={() => { setTab(tb); reset() }}>
              {tb === 'students' ? t('import.students') : t('import.classes')}
            </button>
          ))}
        </div>

        {/* Upload step */}
        {step === 'upload' && (
          <>
            <div
              className={`dropzone ${dragOver ? 'dragover' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px 0' }}>
                {t('import.dropFile')}
              </p>
              <p className="helper">{t('import.orBrowse')}</p>
              <input id="file-input" type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-secondary" onClick={downloadTemplate}>{t('import.downloadTemplate')}</button>
              <span className="helper">{t('import.templateDesc')}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <p className="helper" style={{ margin: 0 }}>
                <strong>{t('import.expectedColumns')}</strong> {columns.map((c, i) => (
                  <span key={c}>{i > 0 && ', '}<code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 4 }}>{c}</code>
                  {(tab === 'students' && (c === 'first_name' || c === 'last_name')) || (tab === 'classes' && c === 'name') ? ' *' : ''}</span>
                ))}
              </p>
              {tab === 'students' && (
                <p className="helper" style={{ margin: '4px 0 0 0' }}>
                  {t('import.tip')}
                </p>
              )}
            </div>
          </>
        )}

        {/* Preview step */}
        {step === 'preview' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <strong>{rows.length} {t('import.rowsFound')}</strong>
                {errors.length > 0 && <span style={{ color: '#dc2626', marginLeft: 8 }}>{errors.length} {t('import.validationErrors')}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={reset}>{t('common.back')}</button>
                <button
                  className="btn btn-primary"
                  onClick={tab === 'students' ? importStudents : importClasses}
                  disabled={hasBlockingErrors}
                >
                  Import {rows.length} {tab}
                </button>
              </div>
            </div>

            <div style={{ overflow: 'auto', maxHeight: 400 }}>
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    {columns.map(col => (
                      <th key={col}>{col}</th>
                    ))}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row, i) => {
                    const errs = rowErrors(i)
                    return (
                      <tr key={i} style={errs.length > 0 ? { background: 'rgba(220,38,38,0.04)' } : undefined}>
                        <td className="helper">{i + 1}</td>
                        {columns.map(col => (
                          <td key={col} style={errs.some(e => e.field === col) ? { color: '#dc2626' } : undefined}>
                            {row[col] || <span className="helper">—</span>}
                          </td>
                        ))}
                        <td>
                          {errs.length > 0
                            ? errs.map((e, j) => <span key={j} className="badge" style={{ color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca', marginRight: 4, fontSize: 11 }}>{e.field}: {e.message}</span>)
                            : <span className="badge badge-success" style={{ fontSize: 11 }}>OK</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {rows.length > 100 && <p className="helper" style={{ marginTop: 8 }}>Showing first 100 of {rows.length} rows</p>}
            </div>
          </>
        )}

        {/* Importing step */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <LoadingSpinner size="lg" />
            <p style={{ marginTop: 12 }}>Importing {rows.length} {tab}...</p>
          </div>
        )}

        {/* Done step */}
        {step === 'done' && result && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{result.failed === 0 && !result.enrollFailed ? '✓' : '⚠'}</div>
            <h3 style={{ margin: '0 0 8px 0' }}>{t('import.complete')}</h3>
            <p>
              <span className="badge badge-success" style={{ marginRight: 8 }}>{result.success} {t('import.imported')}</span>
              {result.failed > 0 && <span className="badge" style={{ color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca' }}>{result.failed} {t('import.failed')}</span>}
            </p>
            {result.enrollFailed ? (
              <p style={{ color: '#b45309', marginTop: 4 }}>
                ⚠ {result.enrollFailed} student(s) imported but could not be auto-enrolled in a class. Enroll them manually from the Students page.
              </p>
            ) : null}
            <button className="btn btn-primary" onClick={reset} style={{ marginTop: 12 }}>{t('import.importMore')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
