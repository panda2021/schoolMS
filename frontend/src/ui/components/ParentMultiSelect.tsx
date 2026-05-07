import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface ParentOption {
  id: string
  name: string
}

interface ParentMultiSelectProps {
  schoolId: string
  selectedParentIds: string[]
  onChange: (ids: string[]) => void
}

export function ParentMultiSelect({ schoolId, selectedParentIds, onChange }: ParentMultiSelectProps) {
  const [parents, setParents] = useState<ParentOption[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('parents')
        .select('id, user_id, users(full_name, email), parent_students(students(first_name, last_name))')
        .eq('school_id', schoolId)
        .is('deleted_at', null)

      const opts: ParentOption[] = (data ?? []).map((p: any) => {
        const fullName = p.users?.full_name?.trim()
        const email = p.users?.email?.trim()
        const children: string[] = (p.parent_students ?? [])
          .map((ps: any) => ps.students ? `${ps.students.first_name} ${ps.students.last_name}` : '')
          .filter(Boolean)
        let label: string
        if (fullName) {
          label = children.length ? `${fullName} (${children.join(', ')})` : fullName
        } else if (email) {
          label = children.length ? `${email} (${children.join(', ')})` : email
        } else if (children.length) {
          label = `Parent of ${children.join(', ')}`
        } else {
          label = 'Unnamed parent'
        }
        return { id: p.id, name: label }
      })
      opts.sort((a, b) => a.name.localeCompare(b.name))
      setParents(opts)
      setLoading(false)
    }
    if (schoolId) load()
  }, [schoolId])

  const filtered = search
    ? parents.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : parents

  const toggle = (id: string) => {
    if (selectedParentIds.includes(id)) {
      onChange(selectedParentIds.filter(pid => pid !== id))
    } else {
      onChange([...selectedParentIds, id])
    }
  }

  const selectAll = () => onChange(filtered.map(p => p.id))
  const clearAll = () => onChange([])

  if (loading) return <div style={{ padding: 12, color: 'var(--muted)', fontSize: 13 }}>Loading parents...</div>

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search parents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '4px 8px', fontSize: 13 }}
        />
        <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={selectAll}>All</button>
        <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} onClick={clearAll}>Clear</button>
      </div>
      <div style={{ maxHeight: 200, overflow: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 12, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No parents found</div>
        ) : (
          filtered.map(p => (
            <label
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 13,
                background: selectedParentIds.includes(p.id) ? 'rgba(37,99,235,0.06)' : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={selectedParentIds.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              {p.name}
            </label>
          ))
        )}
      </div>
      {selectedParentIds.length > 0 && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
          {selectedParentIds.length} parent{selectedParentIds.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  )
}
