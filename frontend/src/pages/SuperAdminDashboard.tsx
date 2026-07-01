import { useEffect, useState } from 'react'
import { supabase, createNonPersistingClient } from '@/lib/supabaseClient'
import { useToast } from '@/ui/components/toast/ToastProvider'
import { LoadingSpinner } from '@/ui/components/LoadingSpinner'
import { Building2, Users, GraduationCap, UserCheck, X, Database, Trash2 } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useLanguage } from '@/i18n/LanguageProvider'

interface SchoolRow {
  id: string
  name: string
  address: string | null
  phone: string | null
  subscription_status: string
  subscription_plan: string
  trial_ends_at: string | null
  student_count: number
  teacher_count: number
}

interface SchoolAdmin {
  id: string
  full_name: string | null
  email: string | null
}

export default function SuperAdminDashboard() {
  const { show } = useToast()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [schools, setSchools] = useState<SchoolRow[]>([])
  const [totalStudents, setTotalStudents] = useState(0)
  const [totalTeachers, setTotalTeachers] = useState(0)
  const [totalParents, setTotalParents] = useState(0)

  // Add school form
  const [showAddSchool, setShowAddSchool] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [adminFullName, setAdminFullName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit modal
  const [editSchool, setEditSchool] = useState<SchoolRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editPlan, setEditPlan] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Admin management in edit modal
  const [schoolAdmin, setSchoolAdmin] = useState<SchoolAdmin | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [showCreateAdmin, setShowCreateAdmin] = useState(false)
  const [availableAdmins, setAvailableAdmins] = useState<{ id: string; full_name: string | null; school_id: string | null }[]>([])
  const [selectedExistingAdmin, setSelectedExistingAdmin] = useState('')
  const [assigningExisting, setAssigningExisting] = useState(false)

  const loadData = async () => {
    setLoading(true)

    // Load all schools
    const { data: schoolData } = await supabase
      .from('schools')
      .select('id, name, address, phone, subscription_status, subscription_plan, trial_ends_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    // Count students per school
    const { data: students } = await supabase
      .from('students')
      .select('school_id')
      .is('deleted_at', null)

    // Count teachers per school
    const { data: teachers } = await supabase
      .from('teachers')
      .select('school_id')
      .is('deleted_at', null)

    // Count parents
    const { data: parents } = await supabase
      .from('parents')
      .select('id')
      .is('deleted_at', null)

    const studentsBySchool: Record<string, number> = {}
    const teachersBySchool: Record<string, number> = {}
    for (const s of students ?? []) {
      studentsBySchool[s.school_id] = (studentsBySchool[s.school_id] || 0) + 1
    }
    for (const t of teachers ?? []) {
      teachersBySchool[t.school_id] = (teachersBySchool[t.school_id] || 0) + 1
    }

    const enriched: SchoolRow[] = (schoolData ?? []).map(s => ({
      ...s,
      student_count: studentsBySchool[s.id] || 0,
      teacher_count: teachersBySchool[s.id] || 0,
    }))

    setSchools(enriched)
    setTotalStudents(students?.length ?? 0)
    setTotalTeachers(teachers?.length ?? 0)
    setTotalParents(parents?.length ?? 0)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Load admin for a school
  const loadSchoolAdmin = async (schoolId: string) => {
    setAdminLoading(true)
    setSchoolAdmin(null)

    // Get school_admin user for this school
    const { data: adminUser } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('school_id', schoolId)
      .eq('role_key', 'school_admin')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (adminUser) {
      const { data: authData } = await supabase.rpc('get_user_email', { user_id: adminUser.id }).maybeSingle() as { data: { email: string } | null }
      setSchoolAdmin({
        id: adminUser.id,
        full_name: adminUser.full_name,
        email: authData?.email ?? null,
      })
    }

    setAdminLoading(false)
  }

  const loadAvailableAdmins = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, school_id')
      .eq('role_key', 'school_admin')
      .is('deleted_at', null)
      .order('full_name')
    setAvailableAdmins((data ?? []) as { id: string; full_name: string | null; school_id: string | null }[])
  }

  const assignExistingAdmin = async () => {
    if (!editSchool || !selectedExistingAdmin) return
    setAssigningExisting(true)
    const { error } = await supabase
      .from('users')
      .update({ school_id: editSchool.id })
      .eq('id', selectedExistingAdmin)
      .eq('role_key', 'school_admin')
    if (error) {
      show(`Assign failed: ${error.message}`, 'error')
    } else {
      show('Admin assigned to this school.', 'success')
      setSelectedExistingAdmin('')
      await loadSchoolAdmin(editSchool.id)
      await loadAvailableAdmins()
    }
    setAssigningExisting(false)
  }

  // Open edit modal
  const openEditModal = async (school: SchoolRow) => {
    setEditSchool(school)
    setEditName(school.name)
    setEditAddress(school.address ?? '')
    setEditPhone(school.phone ?? '')
    setEditStatus(school.subscription_status)
    setEditPlan(school.subscription_plan)
    setShowCreateAdmin(false)
    setNewAdminName('')
    setNewAdminEmail('')
    setNewAdminPassword('')
    setResetPassword('')
    setSelectedExistingAdmin('')
    await loadSchoolAdmin(school.id)
    await loadAvailableAdmins()
  }

  const closeEditModal = () => {
    setEditSchool(null)
    setSchoolAdmin(null)
  }

  const addSchool = async () => {
    if (!newName.trim() || !adminEmail.trim() || !adminPassword.trim() || !adminFullName.trim()) return
    if (adminPassword.length < 6) { show('Password must be at least 6 characters', 'error'); return }
    setSaving(true)

    // 1. Create the admin auth user FIRST, with a non-persisting client (won't
    // affect the current session). Doing this before the school means an
    // already-registered email cannot leave behind an orphan school.
    const tempClient = createNonPersistingClient()
    const { data: authData, error: authErr } = await tempClient.auth.signUp({
      email: adminEmail.trim(),
      password: adminPassword,
      options: { data: { full_name: adminFullName.trim() } },
    })

    if (authErr || !authData.user) {
      show(`Admin account could not be created: ${authErr?.message ?? 'Unknown error'}`, 'error')
      setSaving(false)
      return
    }

    // When "Confirm email" is enabled, signUp with an already-registered email
    // returns an obfuscated user (empty `identities`, a random id) instead of an
    // error. Inserting that id into public.users would violate users_id_fkey.
    if (!authData.user.identities || authData.user.identities.length === 0) {
      show(`That admin email is already registered. Use a different email, or create the school and link the existing admin from the edit screen.`, 'error')
      setSaving(false)
      return
    }

    // 2. Create school
    const { data: schoolData, error: schoolErr } = await supabase.from('schools').insert({
      name: newName.trim(),
      address: newAddress.trim() || null,
      phone: newPhone.trim() || null,
    }).select('id').single()

    if (schoolErr || !schoolData) {
      show(schoolErr?.message ?? 'Failed to create school', 'error')
      setSaving(false)
      return
    }

    const schoolId = schoolData.id

    // 3. Insert into public.users with school_admin role
    // Note: email lives in auth.users, not public.users
    const { error: userErr } = await supabase.from('users').upsert({
      id: authData.user.id,
      full_name: adminFullName.trim(),
      role_key: 'school_admin',
      school_id: schoolId,
    }, { onConflict: 'id' })

    if (userErr) {
      show(`School & auth created but user record failed: ${userErr.message}`, 'error')
    } else {
      show(`School "${newName.trim()}" created with admin ${adminEmail.trim()}`, 'success')
    }

    setNewName(''); setNewAddress(''); setNewPhone('')
    setAdminFullName(''); setAdminEmail(''); setAdminPassword('')
    setShowAddSchool(false)
    await loadData()
    setSaving(false)
  }

  // Save school edits (details + subscription)
  const saveSchoolEdits = async () => {
    if (!editSchool) return
    setEditSaving(true)

    const updates: Record<string, unknown> = {
      name: editName.trim(),
      address: editAddress.trim() || null,
      phone: editPhone.trim() || null,
      subscription_status: editStatus,
      subscription_plan: editPlan,
    }
    if (editStatus === 'suspended') {
      updates.suspended_at = new Date().toISOString()
    } else {
      updates.suspended_at = null
    }

    const { error } = await supabase.from('schools').update(updates).eq('id', editSchool.id)
    if (error) {
      show(error.message, 'error')
    } else {
      show('School updated', 'success')
      closeEditModal()
      await loadData()
    }
    setEditSaving(false)
  }

  // Create a new admin for a school (optionally replacing the existing one).
  // Order: create new first, then unlink old. If anything fails before the new
  // row is committed, the old admin keeps their school_id and is not orphaned.
  const createAdminForSchool = async () => {
    if (!editSchool) return
    if (!newAdminName.trim() || !newAdminEmail.trim() || !newAdminPassword.trim()) return
    if (newAdminPassword.length < 6) { show('Password must be at least 6 characters', 'error'); return }
    setEditSaving(true)

    const tempClient = createNonPersistingClient()
    const { data: authData, error: authErr } = await tempClient.auth.signUp({
      email: newAdminEmail.trim(),
      password: newAdminPassword,
      options: { data: { full_name: newAdminName.trim() } },
    })

    if (authErr || !authData.user) {
      show(`Failed to create admin: ${authErr?.message ?? 'Unknown error'}`, 'error')
      setEditSaving(false)
      return
    }

    // When "Confirm email" is enabled, signUp with an already-registered email
    // returns an obfuscated user (empty `identities`, a random id) instead of an
    // error. Inserting that id into public.users would violate users_id_fkey.
    if (!authData.user.identities || authData.user.identities.length === 0) {
      show(`That email is already registered. Use "Assign an existing admin" below to link them, or use a different email.`, 'error')
      setEditSaving(false)
      return
    }

    const { error: userErr } = await supabase.from('users').upsert({
      id: authData.user.id,
      full_name: newAdminName.trim(),
      role_key: 'school_admin',
      school_id: editSchool.id,
    }, { onConflict: 'id' })

    if (userErr) {
      show(`Auth created but user record failed: ${userErr.message}. Previous admin (if any) is unchanged.`, 'error')
      setEditSaving(false)
      return
    }

    // Only unlink the previous admin AFTER the new one is in place.
    const previousAdminId = schoolAdmin?.id
    if (previousAdminId && previousAdminId !== authData.user.id) {
      await supabase.from('users').update({ school_id: null }).eq('id', previousAdminId)
    }

    show(`Admin ${newAdminEmail.trim()} assigned to ${editSchool.name}`, 'success')
    setShowCreateAdmin(false)
    setNewAdminName('')
    setNewAdminEmail('')
    setNewAdminPassword('')
    await loadSchoolAdmin(editSchool.id)
    await loadAvailableAdmins()
    setEditSaving(false)
  }

  // Reset admin password via server-side RPC
  const resetAdminPassword = async () => {
    if (!schoolAdmin || !resetPassword.trim()) return
    if (resetPassword.length < 6) { show('Password must be at least 6 characters', 'error'); return }
    setEditSaving(true)

    const { error } = await supabase.rpc('admin_reset_password', {
      target_user_id: schoolAdmin.id,
      new_password: resetPassword,
    })

    if (error) {
      show(`Password reset failed: ${error.message}`, 'error')
    } else {
      show('Password reset successfully', 'success')
      setResetPassword('')
    }
    setEditSaving(false)
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'active': return 'badge-success'
      case 'trial': return 'badge-info'
      case 'suspended': return 'badge-warning'
      case 'cancelled': return 'badge-danger'
      default: return ''
    }
  }

  // Demo data state
  const [demoStatus, setDemoStatus] = useState<{ schools: number; classes: number; students: number } | null>(null)
  const [demoBusy, setDemoBusy] = useState<'seed' | 'wipe' | null>(null)

  const refreshDemoStatus = async () => {
    const { data, error } = await supabase.rpc('demo_data_status')
    if (!error && data) {
      setDemoStatus({
        schools: Number((data as any).schools ?? 0),
        classes: Number((data as any).classes ?? 0),
        students: Number((data as any).students ?? 0),
      })
    }
  }

  useEffect(() => { refreshDemoStatus() }, [])

  const seedDemo = async () => {
    if (demoStatus && demoStatus.schools > 0) {
      if (!confirm(`Demo data already exists (${demoStatus.schools} schools, ${demoStatus.students} students). Seeding again will add more rows. Continue?`)) return
    }
    setDemoBusy('seed')
    const { data, error } = await supabase.rpc('seed_demo_data')
    if (error) {
      show(`Seed failed: ${error.message}`, 'error')
    } else {
      const r = data as any
      show(`Demo data seeded: ${r.schools_created} schools, ${r.classes_created} classes, ${r.students_created} students, ${r.announcements_created} announcements.`, 'success')
      await refreshDemoStatus()
      await loadData()
    }
    setDemoBusy(null)
  }

  const wipeDemo = async () => {
    if (!demoStatus || demoStatus.schools === 0) {
      show('No demo data to wipe.', 'success')
      return
    }
    if (!confirm(`This will permanently delete ${demoStatus.schools} demo schools and all their classes (${demoStatus.classes}) and students (${demoStatus.students}). Continue?`)) return
    setDemoBusy('wipe')
    const { data, error } = await supabase.rpc('wipe_demo_data')
    if (error) {
      show(`Wipe failed: ${error.message}`, 'error')
    } else {
      const r = data as any
      show(`Wiped ${r.schools_deleted} demo school${r.schools_deleted === 1 ? '' : 's'} and all their data.`, 'success')
      await refreshDemoStatus()
      await loadData()
    }
    setDemoBusy(null)
  }

  const activeCount = schools.filter(s => s.subscription_status === 'active').length
  const trialCount = schools.filter(s => s.subscription_status === 'trial').length
  const suspendedCount = schools.filter(s => s.subscription_status === 'suspended' || s.subscription_status === 'cancelled').length

  const statusPie = [
    { name: 'Active', value: activeCount, color: '#22c55e' },
    { name: 'Trial', value: trialCount, color: '#3b82f6' },
    { name: 'Inactive', value: suspendedCount, color: '#ef4444' },
  ].filter(d => d.value > 0)

  if (loading) return (
    <div>
      <div className="dash-header"><div className="skeleton" style={{ height: 22, width: 240 }} /></div>
      <div className="stat-grid cols-4">{[1,2,3,4].map(i => <div key={i} className="stat-card"><div className="skeleton" style={{ height: 48 }} /></div>)}</div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="dash-header">
        <h2>{t('super.title')}</h2>
        <p>{t('super.subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="stat-grid cols-4">
        {[
          { label: t('super.schools'), value: schools.length, color: '#3b82f6', icon: <Building2 size={24} /> },
          { label: t('super.students'), value: totalStudents, color: '#8b5cf6', icon: <Users size={24} /> },
          { label: t('super.teachers'), value: totalTeachers, color: '#22c55e', icon: <GraduationCap size={24} /> },
          { label: t('super.parents'), value: totalParents, color: '#f59e0b', icon: <UserCheck size={24} /> },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-accent" style={{ background: s.color }} />
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-icon" style={{ color: s.color }}>{s.icon}</div>
          </div>
        ))}
      </div>

      {/* Demo data panel */}
      <div className="chart-card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={18} /> Demo data
            </h3>
            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
              One-click sample data for product demos. Three Ethiopian schools, 5 classes each, 10 students per class. Wipe cleanly anytime.
            </p>
            {demoStatus && (
              <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 13 }}>
                <span><strong>{demoStatus.schools}</strong> demo schools</span>
                <span>·</span>
                <span><strong>{demoStatus.classes}</strong> classes</span>
                <span>·</span>
                <span><strong>{demoStatus.students}</strong> students</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={seedDemo}
              disabled={demoBusy !== null}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {demoBusy === 'seed' ? <><LoadingSpinner size="sm" /> Seeding…</> : <><Database size={14} /> Populate demo data</>}
            </button>
            <button
              className="btn btn-secondary"
              onClick={wipeDemo}
              disabled={demoBusy !== null || !demoStatus || demoStatus.schools === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#dc2626' }}
            >
              {demoBusy === 'wipe' ? <><LoadingSpinner size="sm" /> Wiping…</> : <><Trash2 size={14} /> Wipe demo data</>}
            </button>
          </div>
        </div>
      </div>

      {/* Subscription chart */}
      {statusPie.length > 0 && (
        <div className="chart-card">
          <h3>{t('super.subscriptionStatus')}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={statusPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={2}>
                  {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'grid', gap: 10 }}>
              {statusPie.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 4, background: d.color }} />
                  <span style={{ fontWeight: 700 }}>{d.value}</span>
                  <span style={{ color: 'var(--muted)' }}>{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Schools management */}
      <div className="chart-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{t('super.schools')}</h3>
          <button className="btn btn-primary" onClick={() => setShowAddSchool(!showAddSchool)}>
            {showAddSchool ? t('common.cancel') : t('super.addSchool')}
          </button>
        </div>

        {showAddSchool && (
          <div style={{ display: 'grid', gap: 16, marginBottom: 20, padding: 16, background: 'var(--bg)', borderRadius: 8 }}>
            {/* School info */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>School Information</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label className="helper">{t('super.schoolName')}</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('super.schoolNamePlaceholder')} />
                </div>
                <div>
                  <label className="helper">{t('super.address')}</label>
                  <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder={t('super.address')} />
                </div>
                <div>
                  <label className="helper">{t('super.phone')}</label>
                  <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder={t('super.phone')} />
                </div>
              </div>
            </div>

            {/* Admin account */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>School Admin Account</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label className="helper">Full Name *</label>
                  <input value={adminFullName} onChange={e => setAdminFullName(e.target.value)} placeholder="Admin full name" />
                </div>
                <div>
                  <label className="helper">Email *</label>
                  <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@school.com" />
                </div>
                <div>
                  <label className="helper">Temporary Password *</label>
                  <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Min 6 characters" />
                </div>
              </div>
            </div>

            <div>
              <button
                className="btn btn-primary"
                onClick={addSchool}
                disabled={saving || !newName.trim() || !adminEmail.trim() || !adminPassword.trim() || !adminFullName.trim()}
              >
                {saving ? <><LoadingSpinner size="sm" /> {t('common.creating')}</> : t('super.createSchool')}
              </button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>{t('super.school')}</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>{t('common.status')}</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>{t('super.plan')}</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>{t('super.students')}</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>{t('super.teachers')}</th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>{t('super.trialEnds')}</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {schools.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 500 }}>{s.name}</div>
                    {s.address && <div className="helper" style={{ fontSize: 11 }}>{s.address}</div>}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span className={`badge ${statusColor(s.subscription_status)}`}>{s.subscription_status}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{s.subscription_plan}</span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.student_count}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.teacher_count}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>
                    {s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => openEditModal(s)}
                    >
                      {t('common.edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {schools.length === 0 && (
          <div className="empty" style={{ padding: 24 }}>{t('super.noSchools')}</div>
        )}
      </div>

      {/* Edit School Modal */}
      {editSchool && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-panel wide" onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 12, padding: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Edit School: {editSchool.name}</h3>
              <button className="btn btn-ghost" onClick={closeEditModal} style={{ padding: 4 }}><X size={20} /></button>
            </div>

            {/* School Details Section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--muted)' }}>School Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label className="helper">{t('super.schoolName')}</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div>
                  <label className="helper">{t('super.address')}</label>
                  <input value={editAddress} onChange={e => setEditAddress(e.target.value)} />
                </div>
                <div>
                  <label className="helper">{t('super.phone')}</label>
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Subscription Section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--muted)' }}>Subscription</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="helper">{t('common.status')}</label>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                    <option value="trial">{t('super.trial')}</option>
                    <option value="active">{t('super.active')}</option>
                    <option value="suspended">{t('super.suspended')}</option>
                    <option value="cancelled">{t('super.cancelled')}</option>
                  </select>
                </div>
                <div>
                  <label className="helper">{t('super.plan')}</label>
                  <select value={editPlan} onChange={e => setEditPlan(e.target.value)}>
                    <option value="basic">{t('super.basic')}</option>
                    <option value="standard">{t('super.standard')}</option>
                    <option value="premium">{t('super.premium')}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Save school details button */}
            <div style={{ marginBottom: 24 }}>
              <button
                className="btn btn-primary"
                onClick={saveSchoolEdits}
                disabled={editSaving || !editName.trim()}
              >
                {editSaving ? <><LoadingSpinner size="sm" /> Saving...</> : 'Save School Details'}
              </button>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0 0 20px' }} />

            {/* Admin Section */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--muted)' }}>School Admin</div>

              {adminLoading ? (
                <div style={{ padding: 12 }}><LoadingSpinner size="sm" /> Loading admin info...</div>
              ) : schoolAdmin ? (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <div className="helper">Name</div>
                      <div style={{ fontWeight: 500 }}>{schoolAdmin.full_name || 'Not set'}</div>
                    </div>
                    <div>
                      <div className="helper">Email</div>
                      <div style={{ fontWeight: 500 }}>{schoolAdmin.email || 'Unable to retrieve'}</div>
                    </div>
                  </div>

                  {/* Password Reset */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label className="helper">Reset Password</label>
                      <input
                        type="password"
                        value={resetPassword}
                        onChange={e => setResetPassword(e.target.value)}
                        placeholder="New password (min 6 chars)"
                      />
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={resetAdminPassword}
                      disabled={editSaving || !resetPassword.trim() || resetPassword.length < 6}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Reset Password
                    </button>
                  </div>

                  {/* Replace admin option */}
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 12, color: 'var(--muted)' }}
                      onClick={() => setShowCreateAdmin(!showCreateAdmin)}
                    >
                      {showCreateAdmin ? 'Cancel' : 'Replace with new admin'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
                    No admin assigned to this school.
                  </div>
                  {availableAdmins.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <label className="helper">Assign an existing admin account</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
                        <select
                          value={selectedExistingAdmin}
                          onChange={e => setSelectedExistingAdmin(e.target.value)}
                          style={{ flex: 1 }}
                        >
                          <option value="">Select an admin...</option>
                          {availableAdmins.map(a => {
                            const otherSchool = a.school_id && a.school_id !== editSchool!.id
                              ? schools.find(s => s.id === a.school_id)?.name
                              : null
                            const orphan = !a.school_id
                            return (
                              <option key={a.id} value={a.id}>
                                {a.full_name || '(no name)'}
                                {orphan ? ' — unassigned' : otherSchool ? ` — currently: ${otherSchool}` : ''}
                              </option>
                            )
                          })}
                        </select>
                        <button
                          className="btn btn-primary"
                          onClick={assignExistingAdmin}
                          disabled={assigningExisting || !selectedExistingAdmin}
                        >
                          {assigningExisting ? <><LoadingSpinner size="sm" /> Assigning...</> : 'Assign'}
                        </button>
                      </div>
                      <div className="helper" style={{ marginTop: 4, fontSize: 11 }}>
                        Reassigning an admin currently linked to another school will unlink them from that school.
                      </div>
                    </div>
                  )}
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={() => setShowCreateAdmin(true)}
                  >
                    Or create a new admin
                  </button>
                </div>
              )}

              {/* Create new admin form */}
              {showCreateAdmin && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 16 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>
                    {schoolAdmin ? 'Create New Admin (replaces current)' : 'Create Admin Account'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label className="helper">Full Name *</label>
                      <input value={newAdminName} onChange={e => setNewAdminName(e.target.value)} placeholder="Admin full name" />
                    </div>
                    <div>
                      <label className="helper">Email *</label>
                      <input type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="admin@school.com" />
                    </div>
                    <div>
                      <label className="helper">Temporary Password *</label>
                      <input type="password" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="Min 6 characters" />
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={createAdminForSchool}
                    disabled={editSaving || !newAdminName.trim() || !newAdminEmail.trim() || !newAdminPassword.trim() || newAdminPassword.length < 6}
                  >
                    {editSaving ? <><LoadingSpinner size="sm" /> Creating...</> : 'Create & Assign Admin'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
