// scripts/smoke_phase5.mjs — verify 0027-0031 objects exist on the live DB via anon client.
// Existence checks only — anon RLS returns empty rows (fine); a missing table
// or column errors distinctly; a missing function returns PGRST202.
// Usage (module-resolution gotcha — must run FROM frontend/):
//   cp scripts/smoke_phase5.mjs frontend/.s.mjs && cd frontend && node .s.mjs && rm .s.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../frontend/.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

let pass = 0, fail = 0
const failures = []
const ok = n => { console.log(`  ✓ ${n}`); pass++ }
const ko = (n, m) => { console.log(`  ✗ ${n} — ${m}`); fail++; failures.push(n) }

async function tableCols(name, table, cols) {
  const { error } = await sb.from(table).select(cols).limit(1)
  if (!error) ok(name)
  else ko(name, `${error.code ?? ''} ${error.message}`)
}
// A function exists if calling it fails with anything OTHER than PGRST202 (not found)
async function fnExists(name, fn, args) {
  const { error } = await sb.rpc(fn, args)
  if (!error) { ok(name + ' (callable)'); return }
  if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) ko(name, 'function not found')
  else ok(`${name} (exists; anon call rejected as expected: ${error.message.slice(0, 60)})`)
}

console.log('0027 feature framework:')
await tableCols('features table', 'features', 'key, feature, action, label')
await tableCols('role_features table', 'role_features', 'role_key, feature_key')
await tableCols('user_feature_overrides table', 'user_feature_overrides', 'user_id, feature_key, granted_by')
await fnExists('my_features()', 'my_features', {})
await fnExists('user_can()', 'user_can', { p_feature_key: 'attendance.view' })

console.log('0028 branding:')
await tableCols('schools branding columns', 'schools', 'logo_url, primary_color, secondary_color, bg_image_url, bg_opacity')

console.log('0029 staff password reset:')
await fnExists('admin_reset_password()', 'admin_reset_password', { target_user_id: '00000000-0000-0000-0000-000000000000', new_password: 'xxxxxxx' })

console.log('0030 parent invites + pending:')
await tableCols('pending_invitations.student_ids/relation', 'pending_invitations', 'id, student_ids, relation')
await tableCols('parent_students.relation', 'parent_students', 'parent_id, student_id, relation')
await fnExists('ensure_user_profile()', 'ensure_user_profile', {})
await fnExists('approve_pending_user()', 'approve_pending_user', { target_user_id: '00000000-0000-0000-0000-000000000000', new_role: 'parent', target_school_id: '00000000-0000-0000-0000-000000000000' })
await fnExists('reject_pending_user()', 'reject_pending_user', { target_user_id: '00000000-0000-0000-0000-000000000000' })

console.log('0031: row-seed only — not verifiable anonymously. After applying, confirm')
console.log('      via /app/features: "View own children\'s attendance" + "Grant extra permissions" rows exist.')

console.log(`\n${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(', ') : ''}`)
process.exit(fail ? 1 : 0)
