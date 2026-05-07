// scripts/smoke_live.mjs — runs a handful of anonymous queries against the live
// Supabase project. We can't fully test RLS without a session, but we CAN:
//   - Confirm migrations 0017-0023 are applied (table existence)
//   - Confirm announcements no longer 42P17 (the recursion fix)
//   - Confirm helpers exist (ensure_user_profile)
//
// Usage: node scripts/smoke_live.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../frontend/.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    })
)

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) { console.error('Missing VITE_SUPABASE_URL/ANON_KEY'); process.exit(1) }

const sb = createClient(url, key)

let pass = 0, fail = 0
const failures = []

async function check(name, fn) {
  try {
    const result = await fn()
    if (result === true || result === undefined) { console.log(`  ✓ ${name}`); pass++ }
    else { console.log(`  ✗ ${name} — ${result}`); fail++; failures.push(`${name}: ${result}`) }
  } catch (e) {
    console.log(`  ✗ ${name} — exception: ${e.message}`)
    fail++; failures.push(`${name}: ${e.message}`)
  }
}

// -- A query that returns the relation itself "exists" if no relation-error is thrown.
// PostgREST returns error.code='42P01' for missing relation.
async function tableExists(name) {
  const { error } = await sb.from(name).select('*').limit(0)
  if (!error) return true
  if (error.code === '42P01') return `relation missing (${error.message})`
  // RLS blocking us with a *clean* error means relation exists
  if (error.code === '42501' || error.code === 'PGRST301' || /permission denied/.test(error.message)) return true
  if (error.code === '42P17') return `recursion in policy: ${error.message}`
  return `unknown error: ${error.code} ${error.message}`
}

console.log('== Migrations 0017-0023 tables ==')
for (const t of [
  'announcements', 'announcement_recipients',
  'media_assets', 'daily_updates',
  'pending_invitations',
  'helpdesk_tickets', 'helpdesk_messages',
]) {
  await check(`table ${t}`, async () => tableExists(t))
}

console.log('\n== Announcement recursion (42P17) regression ==')
await check('announcements query does not raise 42P17', async () => {
  const { error } = await sb.from('announcements').select('id').limit(1)
  if (!error) return true
  if (error.code === '42P17') return `STILL RECURSIVE: ${error.message}`
  // Any other error (including RLS denial) means recursion fix is in place
  return true
})

await check('announcement_recipients query does not raise 42P17', async () => {
  const { error } = await sb.from('announcement_recipients').select('announcement_id').limit(1)
  if (!error) return true
  if (error.code === '42P17') return `STILL RECURSIVE: ${error.message}`
  return true
})

console.log('\n== ensure_user_profile RPC discoverable ==')
await check('ensure_user_profile RPC exists (rejects anon)', async () => {
  const { error } = await sb.rpc('ensure_user_profile')
  // Anon should hit "Not authenticated" raise
  if (error && /Not authenticated/i.test(error.message)) return true
  // Or a generic RPC-not-found would be 404
  if (error && (error.code === 'PGRST202' || /not found/i.test(error.message))) return `RPC missing: ${error.message}`
  return true
})

console.log('\n----')
console.log(`PASSED: ${pass}`)
console.log(`FAILED: ${fail}`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
