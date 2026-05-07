#!/usr/bin/env bash
# scripts/smoke_db.sh — verify migrations 0001-0023 are applied and core RLS objects exist.
#
# Usage:
#   DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres" \
#   bash scripts/smoke_db.sh
#
# Or, if you prefer SUPABASE_DB_URL:
#   SUPABASE_DB_URL=... bash scripts/smoke_db.sh

set -u

DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: set DATABASE_URL or SUPABASE_DB_URL"
  exit 1
fi

PASS=0
FAIL=0
FAIL_NAMES=()

ok() { echo "  ✓ $1"; PASS=$((PASS+1)); }
ko() { echo "  ✗ $1"; FAIL=$((FAIL+1)); FAIL_NAMES+=("$1"); }

# Run a SELECT and require at least one row.
expect_row() {
  local name="$1"
  local sql="$2"
  local out
  out=$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "$sql" 2>&1)
  if [[ -n "$out" && "$out" != "0" ]]; then
    ok "$name"
  else
    ko "$name (got: '$out')"
  fi
}

echo "== Tables =="
for t in roles users schools teachers parents students parent_students classes enrollments \
         attendance daily_updates messages progress_reports announcements media_assets \
         announcement_recipients subjects class_subject_teachers assessment_types grades \
         grade_exemptions pending_invitations helpdesk_tickets helpdesk_messages; do
  expect_row "table public.$t exists" \
    "select 1 from information_schema.tables where table_schema='public' and table_name='$t'"
done

echo
echo "== Helper functions =="
for f in current_user_id current_school_id current_teacher_id user_school_id user_role \
         is_school_admin is_teacher is_parent is_super_admin get_teacher_id get_parent_id \
         is_in_same_school parent_can_see_announcement can_view_recipient_row \
         ensure_user_profile media_asset_for_object seed_default_subjects; do
  expect_row "function public.$f exists" \
    "select 1 from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname='$f'"
done

echo
echo "== RLS on core tables =="
for t in users teachers parents students classes enrollments attendance daily_updates messages \
         announcements announcement_recipients media_assets grades helpdesk_tickets helpdesk_messages \
         pending_invitations; do
  expect_row "RLS enabled on $t" \
    "select 1 from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relname='$t' and c.relrowsecurity=true"
done

echo
echo "== Critical policies present =="
expect_row "announcements_select_scope on announcements" \
  "select 1 from pg_policies where schemaname='public' and tablename='announcements' and policyname='announcements_select_scope'"
expect_row "announcement_recipients_select on announcement_recipients" \
  "select 1 from pg_policies where schemaname='public' and tablename='announcement_recipients' and policyname='announcement_recipients_select'"
expect_row "daily_updates_select_scope on daily_updates" \
  "select 1 from pg_policies where schemaname='public' and tablename='daily_updates' and policyname='daily_updates_select_scope'"
expect_row "storage_insert_media_parent_chat on storage.objects" \
  "select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='storage_insert_media_parent_chat'"
expect_row "media_assets_insert_parent on media_assets" \
  "select 1 from pg_policies where schemaname='public' and tablename='media_assets' and policyname='media_assets_insert_parent'"
expect_row "hd_tickets_select on helpdesk_tickets" \
  "select 1 from pg_policies where schemaname='public' and tablename='helpdesk_tickets' and policyname='hd_tickets_select'"

echo
echo "== Recursion fix smoke (announcements query as anon must not error) =="
RES=$(psql "$DB_URL" -At -v ON_ERROR_STOP=0 -c "set role authenticated; select count(*) from public.announcements limit 1; reset role" 2>&1)
if echo "$RES" | grep -qi 'infinite recursion'; then
  ko "announcements still recursive: $RES"
else
  ok "announcements query did not raise 42P17"
fi

echo
echo "----"
echo "PASSED: $PASS"
echo "FAILED: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "Failures:"
  for f in "${FAIL_NAMES[@]}"; do echo "  - $f"; done
  exit 1
fi
