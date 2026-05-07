-- Migration 0020: ensure_user_profile() — provisions a public.users row on first login
--
-- Use case: a parent receives a magic link and signs in via Supabase Auth,
-- but has no row in public.users. Without that row their role is unknown and
-- the app falls through to the teacher dashboard. This RPC reconciles the
-- profile in three ways:
--   1. Profile already exists keyed by auth.uid() — return its role.
--   2. Profile exists keyed by email but its id is wrong (admin pre-created it
--      with a placeholder id) — re-bind the row to the auth user's id.
--   3. No profile exists — create one with role='parent', school_id=NULL.
--      The school admin can later attach them to a school.

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS TABLE(role_key text, school_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_existing_id uuid;
  v_role text;
  v_school uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Path 1: profile already exists for this auth user
  SELECT u.role_key, u.school_id INTO v_role, v_school
  FROM public.users u
  WHERE u.id = v_uid AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    role_key := v_role;
    school_id := v_school;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Path 2: get the user's email from auth.users to look up an admin-created profile
  SELECT au.email::text INTO v_email FROM auth.users au WHERE au.id = v_uid;

  IF v_email IS NOT NULL THEN
    SELECT u.id INTO v_existing_id
    FROM public.users u
    WHERE lower(u.email) = lower(v_email) AND u.deleted_at IS NULL
    LIMIT 1;

    IF v_existing_id IS NOT NULL AND v_existing_id <> v_uid THEN
      -- Re-bind admin-created row to this auth user
      UPDATE public.users
        SET id = v_uid, updated_at = now()
        WHERE id = v_existing_id
        RETURNING role_key, school_id INTO v_role, v_school;
      role_key := v_role;
      school_id := v_school;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Path 3: brand new user. Default to parent. school_id stays NULL until an
  -- admin links them. The frontend should show a "waiting for school link"
  -- screen if school_id is null.
  INSERT INTO public.users (id, email, role_key, school_id)
  VALUES (v_uid, v_email, 'parent', NULL)
  ON CONFLICT (id) DO NOTHING;

  role_key := 'parent';
  school_id := NULL;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
