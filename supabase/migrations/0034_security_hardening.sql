-- Migration 0034: security hardening (audit 2026-07-06)
-- Fixes 1 critical + 4 high findings. All changes verified against the live
-- write paths so legitimate flows (invite acceptance, super-admin approval,
-- super-admin school edits, demo seeding) keep working.

-- ---------------------------------------------------------------------------
-- FIX 1 (CRITICAL): stop self-escalation of role_key / school_id.
-- users_update_any / users_update_self_or_admin_school let a user UPDATE their
-- own row (id = auth.uid()) with NO column restriction, so any teacher/parent
-- could set role_key = 'super_admin'. RLS can't do column-level guards, so we
-- use a BEFORE UPDATE trigger.
--
-- The only legitimate writers of role_key/school_id are the SECURITY DEFINER
-- functions ensure_user_profile() (invite acceptance) and approve_pending_user(),
-- both owned by 'postgres' -> current_user = 'postgres' inside them. Direct
-- client updates run as role 'authenticated' (or 'anon'). So we block the change
-- only for those end-user roles, and only when the caller is not a super admin
-- (super admins legitimately reassign school_id from the dashboard).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_privilege_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT public.is_super_admin()
     AND (NEW.role_key  IS DISTINCT FROM OLD.role_key
          OR NEW.school_id IS DISTINCT FROM OLD.school_id) THEN
    RAISE EXCEPTION 'Not allowed to change role_key or school_id'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_privilege_columns ON public.users;
CREATE TRIGGER users_guard_privilege_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_privilege_columns();

-- ---------------------------------------------------------------------------
-- FIX 2 (HIGH): cross-tenant school writes.
-- schools_update_any (is_school_admin OR is_super_admin, unscoped) let ANY
-- school_admin update ANY school. Replace with a super-admin-only policy and
-- keep the correctly-scoped schools_update_admin for a school_admin's own
-- school. Lock INSERT to super_admin (schools are created only from the
-- super-admin dashboard; there is no self-serve school registration).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS schools_update_any ON public.schools;
CREATE POLICY schools_update_super ON public.schools
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS schools_insert_any ON public.schools;
DROP POLICY IF EXISTS schools_insert_admin ON public.schools;
CREATE POLICY schools_insert_super ON public.schools
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- FIX 3 (HIGH): cross-school media deletion.
-- storage_delete_media_staff allowed any teacher/admin to delete ANY object in
-- the media bucket (no school scoping). Scope it by folder prefix; keep an
-- unscoped branch for super_admin. (No app flow calls .remove() today, so this
-- only removes latent attack surface.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS storage_delete_media_staff ON storage.objects;
CREATE POLICY storage_delete_media_staff ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'media' AND (
      public.is_super_admin()
      OR ((public.is_school_admin() OR public.is_teacher())
          AND (storage.foldername(name))[1] = (public.user_school_id())::text)
    )
  );

-- ---------------------------------------------------------------------------
-- FIX 4 (HIGH): super_admin cannot read helpdesk/media attachments.
-- The sole super_admin row has school_id NULL, so neither media SELECT policy
-- matches and support silently never sees user-uploaded attachments. Add a
-- super-admin SELECT branch (mirrors media_assets_select_scope which already
-- has one).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS storage_media_select_super ON storage.objects;
CREATE POLICY storage_media_select_super ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND public.is_super_admin());

-- ---------------------------------------------------------------------------
-- FIX 5 (HIGH): mutating admin functions executable by anon.
-- They already self-gate on is_super_admin() (so anon calls fail safely), but
-- revoke EXECUTE from anon/PUBLIC as defense-in-depth. Scoped to the mutating
-- functions only -- the read-helper functions (is_super_admin, user_role,
-- current_school_id, user_school_id, user_can, my_features, is_in_same_school)
-- are referenced inside RLS policies and must remain executable.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_reset_password(uuid, text)          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_pending_user(uuid, text, uuid)    FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_pending_user(uuid)                 FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.seed_demo_data()                          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.wipe_demo_data()                          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid)                      FROM anon, public;
