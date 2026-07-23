#!/usr/bin/env node
// scripts/seed-demo-users.mjs — create-or-reset one demo login per role, idempotently.
//
// Roles seeded (must match public.roles + RoleRedirect.tsx):
//   super_admin   -> /app/super
//   school_admin  -> /app/admin
//   teacher       -> /app/teacher
//   parent        -> /app/parent
//
// What it does, per role:
//   1. Create the auth user (admin API, email pre-confirmed) or reset the
//      password if the auth user already exists.
//   2. Delete orphaned public.users rows that hold the demo email under a
//      DIFFERENT id (the old users_id_fkey / "invalid credentials" bug).
//   3. Upsert the public.users profile row keyed by the auth user's id
//      (satisfies users_id_fkey: auth user is created FIRST).
//   4. Upsert the specialization row (public.teachers / public.parents) and,
//      for the parent, link a demo student so the dashboard isn't empty.
//   5. Smoke test: signInWithPassword with the ANON key (same call the app
//      makes) and verify the profile row resolves to the expected role.
//   6. Regenerate DEMO_LOGINS.md at the project root.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-users.mjs --yes
//
// Env vars:
//   SUPABASE_SERVICE_ROLE_KEY  (required — never committed anywhere)
//   SUPABASE_URL               (optional — falls back to frontend/.env.local VITE_SUPABASE_URL)
//   SUPABASE_ANON_KEY          (optional — falls back to frontend/.env.local VITE_SUPABASE_ANON_KEY)
//   DEMO_PASSWORD              (optional — shared password for all demo accounts;
//                               generated and printed if not set)
//
// Safety: refuses to run without the --yes flag so it is never fired at a
// project by accident. NO secrets are written to DEMO_LOGINS.md except the
// demo password itself (which is the point of the file).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

// ---------------------------------------------------------------------------
// Resolve @supabase/supabase-js (installed under frontend/, not the repo root)
// ---------------------------------------------------------------------------
function loadSupabase() {
  const anchors = [
    new URL('./x.js', import.meta.url),            // scripts/ (repo root node_modules, if any)
    new URL('../frontend/x.js', import.meta.url),  // frontend/node_modules
  ]
  for (const anchor of anchors) {
    try {
      return createRequire(anchor)('@supabase/supabase-js')
    } catch { /* try next */ }
  }
  console.error('Could not resolve @supabase/supabase-js. Run: cd frontend && npm install')
  process.exit(1)
}
const { createClient } = loadSupabase()

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = new URL('..', import.meta.url) // project root (scripts/..)

function readEnvLocal() {
  const path = new URL('frontend/.env.local', ROOT)
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const idx = l.indexOf('=')
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
      })
  )
}

const envLocal = readEnvLocal()
const SUPABASE_URL = process.env.SUPABASE_URL || envLocal.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY || envLocal.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL (env var or frontend/.env.local VITE_SUPABASE_URL)')
  process.exit(1)
}
if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var (Supabase dashboard > Settings > API).')
  console.error('Never commit this key. Pass it inline:')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-users.mjs --yes')
  process.exit(1)
}
if (!ANON_KEY) {
  console.error('Missing SUPABASE_ANON_KEY (env var or frontend/.env.local VITE_SUPABASE_ANON_KEY) — needed for the login smoke test.')
  process.exit(1)
}

if (!process.argv.includes('--yes')) {
  console.log(`Target Supabase project: ${SUPABASE_URL}`)
  console.log('This will create/reset demo auth users and profile rows on that project.')
  console.log('Re-run with --yes to proceed.')
  process.exit(0)
}

const DEMO_PASSWORD =
  process.env.DEMO_PASSWORD || `Abogida-${randomBytes(9).toString('base64url')}`

const DEMO_SCHOOL_NAME = '[DEMO] Abogida Demo School'

const DEMO_USERS = [
  {
    email: 'demo-super-admin@abogida-demo.com',
    role_key: 'super_admin',
    full_name: 'Demo Super Admin',
    needsSchool: false,
    landing: '/app/super',
    can: 'sees ALL schools, seeds/wipes demo data, helpdesk, feature matrix',
  },
  {
    email: 'demo-school-admin@abogida-demo.com',
    role_key: 'school_admin',
    full_name: 'Demo School Admin',
    needsSchool: true,
    landing: '/app/admin',
    can: 'manages one school: teachers, students, classes, parents, announcements, settings',
  },
  {
    email: 'demo-teacher@abogida-demo.com',
    role_key: 'teacher',
    full_name: 'Demo Teacher',
    needsSchool: true,
    landing: '/app/teacher',
    can: 'attendance, grades/assessments, daily updates, messages for their classes',
  },
  {
    email: 'demo-parent@abogida-demo.com',
    role_key: 'parent',
    full_name: 'Demo Parent',
    needsSchool: true,
    landing: '/app/parent',
    can: "views own children's attendance, daily updates, announcements, messages",
  },
]

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function die(step, error) {
  console.error(`\nFAILED at: ${step}`)
  console.error(error?.message || error)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
async function findAuthUserByEmail(email) {
  const target = email.toLowerCase()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) die(`listUsers page ${page}`, error)
    const hit = data.users.find(u => (u.email || '').toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 1000) return null
    page++
  }
}

async function createOrResetAuthUser(email) {
  const existing = await findAuthUserByEmail(email)
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      ban_duration: 'none',
    })
    if (error) die(`reset password for ${email}`, error)
    return { id: existing.id, created: false }
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true, // no confirmation email; login works immediately
    user_metadata: { demo: true },
  })
  if (error) die(`create auth user ${email}`, error)
  return { id: data.user.id, created: true }
}

// ---------------------------------------------------------------------------
// Data helpers (service role bypasses RLS)
// ---------------------------------------------------------------------------
async function ensureDemoSchool() {
  const { data: found, error: selErr } = await admin
    .from('schools')
    .select('id')
    .eq('name', DEMO_SCHOOL_NAME)
    .is('deleted_at', null)
    .limit(1)
  if (selErr) die('select demo school', selErr)
  if (found && found.length) return found[0].id

  const { data, error } = await admin
    .from('schools')
    .insert({
      name: DEMO_SCHOOL_NAME,
      address: 'Addis Ababa, Ethiopia',
      phone: '+251-11-000-0000',
      is_demo: true,
    })
    .select('id')
    .single()
  if (error) die('create demo school', error)
  return data.id
}

async function ensureDemoStudent(schoolId) {
  const { data: found, error: selErr } = await admin
    .from('students')
    .select('id')
    .eq('school_id', schoolId)
    .eq('first_name', 'Demo')
    .eq('last_name', 'Student')
    .limit(1)
  if (selErr) die('select demo student', selErr)
  if (found && found.length) return found[0].id

  const { data, error } = await admin
    .from('students')
    .insert({ school_id: schoolId, first_name: 'Demo', last_name: 'Student' })
    .select('id')
    .single()
  if (error) die('create demo student', error)
  return data.id
}

async function seedProfile(user, authId, schoolId) {
  // Kill orphaned profile rows holding this email under a different id —
  // this is exactly the users_id_fkey / stale-row bug that broke logins before.
  const { error: orphanErr } = await admin
    .from('users')
    .delete()
    .ilike('email', user.email)
    .neq('id', authId)
  if (orphanErr) die(`delete orphaned profile rows for ${user.email}`, orphanErr)

  // Profile row: id must equal auth.users.id (users_id_fkey). Auth user
  // already exists at this point, so the FK is satisfied.
  const { error: upsertErr } = await admin.from('users').upsert(
    {
      id: authId,
      email: user.email,
      role_key: user.role_key,
      school_id: user.needsSchool ? schoolId : null,
      full_name: user.full_name,
      language_preference: 'en',
      deleted_at: null, // revive soft-deleted demo accounts
    },
    { onConflict: 'id' }
  )
  if (upsertErr) die(`upsert public.users for ${user.email}`, upsertErr)

  // Specialization rows
  if (user.role_key === 'teacher') {
    const { error } = await admin
      .from('teachers')
      .upsert({ user_id: authId, school_id: schoolId, deleted_at: null }, { onConflict: 'user_id' })
    if (error) die(`upsert public.teachers for ${user.email}`, error)
  }

  if (user.role_key === 'parent') {
    const { error } = await admin
      .from('parents')
      .upsert({ user_id: authId, school_id: schoolId, deleted_at: null }, { onConflict: 'user_id' })
    if (error) die(`upsert public.parents for ${user.email}`, error)

    // Link a demo child so the parent dashboard has content.
    const { data: parentRow, error: pErr } = await admin
      .from('parents')
      .select('id')
      .eq('user_id', authId)
      .single()
    if (pErr) die('fetch parent row', pErr)

    const studentId = await ensureDemoStudent(schoolId)
    const { data: link, error: linkSelErr } = await admin
      .from('parent_students')
      .select('parent_id')
      .eq('parent_id', parentRow.id)
      .eq('student_id', studentId)
      .limit(1)
    if (linkSelErr) die('select parent_students link', linkSelErr)
    if (!link || !link.length) {
      const { error: linkErr } = await admin
        .from('parent_students')
        .insert({ parent_id: parentRow.id, student_id: studentId, relation: 'guardian' })
      if (linkErr) die('insert parent_students link', linkErr)
    }
  }
}

// ---------------------------------------------------------------------------
// Smoke test — the same signInWithPassword call Login.tsx makes
// ---------------------------------------------------------------------------
async function smokeTest(user) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: DEMO_PASSWORD,
  })
  if (error || !data?.session) return { ok: false, detail: error?.message || 'no session returned' }

  // Same lookup RoleRedirect.tsx performs after login.
  const { data: profile, error: profErr } = await client
    .from('users')
    .select('role_key, school_id')
    .eq('id', data.user.id)
    .maybeSingle()
  await client.auth.signOut()

  if (profErr) return { ok: false, detail: `login OK but profile query failed: ${profErr.message}` }
  if (!profile) return { ok: false, detail: 'login OK but no public.users row visible (RLS or missing row)' }
  if (profile.role_key !== user.role_key) {
    return { ok: false, detail: `login OK but role is '${profile.role_key}', expected '${user.role_key}'` }
  }
  return { ok: true, detail: `role=${profile.role_key}` }
}

// ---------------------------------------------------------------------------
// DEMO_LOGINS.md
// ---------------------------------------------------------------------------
function writeDemoLogins(results) {
  const date = new Date().toISOString().slice(0, 10)
  const lines = [
    '# Abogida — Demo Logins',
    '',
    `> Generated by \`scripts/seed-demo-users.mjs\` on ${date}. Do not edit by hand — re-run the script instead.`,
    '',
    `**Password for ALL demo accounts:** \`${DEMO_PASSWORD}\``,
    '',
    '| Role | Email | Lands on | Can do | Login test |',
    '|---|---|---|---|---|',
    ...DEMO_USERS.map(u => {
      const r = results.get(u.email)
      const status = r?.ok ? 'PASS' : `FAIL (${r?.detail || 'not run'})`
      return `| ${u.role_key} | \`${u.email}\` | \`${u.landing}\` | ${u.can} | ${status} |`
    }),
    '',
    'All accounts belong to the school **' + DEMO_SCHOOL_NAME + '** (except super_admin, which is global).',
    'To reset these accounts (e.g. after a tester changes a password), re-run:',
    '',
    '```bash',
    'SUPABASE_SERVICE_ROLE_KEY=... DEMO_PASSWORD=... node scripts/seed-demo-users.mjs --yes',
    '```',
    '',
  ]
  const path = new URL('DEMO_LOGINS.md', ROOT)
  writeFileSync(path, lines.join('\n'))
  return path.pathname
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Target: ${SUPABASE_URL}`)
  console.log(`Demo password: ${process.env.DEMO_PASSWORD ? '(from DEMO_PASSWORD env)' : DEMO_PASSWORD + '  (generated — saved to DEMO_LOGINS.md)'}`)

  console.log('\n== Ensure demo school ==')
  const schoolId = await ensureDemoSchool()
  console.log(`  school "${DEMO_SCHOOL_NAME}" -> ${schoolId}`)

  console.log('\n== Seed users ==')
  for (const user of DEMO_USERS) {
    const { id, created } = await createOrResetAuthUser(user.email)
    await seedProfile(user, id, schoolId)
    console.log(`  ${created ? 'created' : 'reset  '} ${user.role_key.padEnd(13)} ${user.email} (${id})`)
  }

  console.log('\n== Smoke test (signInWithPassword with anon key) ==')
  const results = new Map()
  let failures = 0
  for (const user of DEMO_USERS) {
    const r = await smokeTest(user)
    results.set(user.email, r)
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${user.role_key.padEnd(13)} ${user.email}${r.ok ? '' : ' — ' + r.detail}`)
    if (!r.ok) failures++
  }

  const mdPath = writeDemoLogins(results)
  console.log(`\nWrote ${mdPath}`)

  if (failures) {
    console.error(`\n${failures} account(s) FAILED the login smoke test. See details above.`)
    process.exit(1)
  }
  console.log('\nAll demo logins verified. Share DEMO_LOGINS.md with testers.')
}

main().catch(e => die('unexpected error', e))
