-- Migration 0029: Let school admins reset passwords for their own teachers/parents
--
-- Before: admin_reset_password (0016, fixed in 0026) was super_admin-only, so a
-- school admin had no way to recover a teacher or parent who lost their
-- password (magic link was the only workaround).
--
-- After:
--   * super_admin        -> can reset any user (unchanged)
--   * school_admin       -> can reset teachers/parents in their OWN school,
--                           gated by the new 'users.reset_password' capability
--                           (Phase 2 framework, 0027) so it shows up in the
--                           Feature Matrix and can be granted per-user later.
--   * everyone else      -> rejected
--
-- Non-breaking: the super-admin flow in SuperAdminDashboard keeps calling the
-- same RPC signature.

-- 1. Register the capability and seed it to school_admin (matches current
--    "admins manage their staff" intent; toggleable in /app/features).
INSERT INTO public.features (key, feature, action, label, sort_order) VALUES
  ('users.reset_password', 'users', 'reset_password', 'Reset member passwords', 150)
ON CONFLICT (key) DO UPDATE
  SET feature = EXCLUDED.feature,
      action  = EXCLUDED.action,
      label   = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order;

INSERT INTO public.role_features (role_key, feature_key) VALUES
  ('school_admin', 'users.reset_password')
ON CONFLICT DO NOTHING;

-- 2. Widen the RPC guard.
CREATE OR REPLACE FUNCTION public.admin_reset_password(target_user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target_role   text;
  target_school uuid;
BEGIN
  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  SELECT role_key, school_id INTO target_role, target_school
  FROM public.users
  WHERE id = target_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF public.is_super_admin() THEN
    -- super admin: any user
    NULL;
  ELSIF public.user_can('users.reset_password')
    AND target_school IS NOT NULL
    AND target_school = public.current_school_id()
    AND target_role IN ('teacher', 'parent') THEN
    -- capability-holder (school_admin by default): own school staff/parents only,
    -- never other admins or super admins
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized to reset this user''s password';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO authenticated;
