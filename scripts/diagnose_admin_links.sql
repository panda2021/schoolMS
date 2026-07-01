-- Diagnostic for the "schools have no admin" / "admin attendance is empty" bug.
-- Run each block separately in Supabase SQL editor and inspect results.

-- BLOCK 1: List every school_admin user and whether they have a school_id.
SELECT
  u.id AS user_id,
  u.full_name,
  u.email,
  u.role_key,
  u.school_id,
  u.deleted_at,
  s.name AS school_name,
  s.deleted_at AS school_deleted_at
FROM public.users u
LEFT JOIN public.schools s ON s.id = u.school_id
WHERE u.role_key = 'school_admin'
ORDER BY u.created_at;

-- Symptom: rows where school_id IS NULL. Those admins are orphaned.
-- Symptom: rows where school_id IS NOT NULL but school_name IS NULL — the
--          school was hard-deleted but the admin still references it.

-- BLOCK 2: List every school that has no school_admin.
SELECT s.id, s.name, s.created_at
FROM public.schools s
WHERE s.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.school_id = s.id
      AND u.role_key = 'school_admin'
      AND u.deleted_at IS NULL
  )
ORDER BY s.created_at;

-- BLOCK 3: Best-effort mapping orphaned admins -> schools by timestamp proximity.
-- This is a HINT, not authoritative. Use it to decide who belongs where, then
-- run the UPDATE in BLOCK 4 with the chosen ids.
WITH orphans AS (
  SELECT id, full_name, email, created_at
  FROM public.users
  WHERE role_key = 'school_admin' AND school_id IS NULL AND deleted_at IS NULL
)
SELECT
  o.id AS admin_id,
  o.full_name AS admin_name,
  o.email AS admin_email,
  o.created_at AS admin_created_at,
  s.id AS guessed_school_id,
  s.name AS guessed_school_name,
  s.created_at AS school_created_at,
  ABS(EXTRACT(EPOCH FROM (s.created_at - o.created_at))) AS seconds_apart
FROM orphans o
CROSS JOIN LATERAL (
  SELECT id, name, created_at FROM public.schools
  WHERE deleted_at IS NULL
  ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - o.created_at)))
  LIMIT 1
) s
ORDER BY o.created_at;

-- BLOCK 4: Re-link a specific admin to a specific school. Verify BLOCK 3 first.
-- Replace the placeholders below for each orphan.
-- UPDATE public.users
-- SET school_id = '<paste school id>'
-- WHERE id = '<paste admin user id>'
--   AND role_key = 'school_admin';
