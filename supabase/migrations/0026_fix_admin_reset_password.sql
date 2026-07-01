-- Migration 0026: Fix super-admin password reset for school admins
--
-- Bug: admin_reset_password (0016) called crypt() and gen_salt() from pgcrypto,
-- but its search_path was set to 'public' only. pgcrypto lives in the
-- 'extensions' schema on Supabase, so those functions were unresolvable. The
-- RPC errored, but because the frontend awaited a void return without
-- inspecting the error path correctly the user saw a success toast while the
-- password was never actually updated. Fix: include extensions in search_path.
--
-- Also: bump updated_at so GoTrue invalidates any cached state.

CREATE OR REPLACE FUNCTION public.admin_reset_password(target_user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can reset passwords';
  END IF;
  IF length(new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
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
