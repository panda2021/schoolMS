-- Migration 0025: Fix teacher invite consumption in ensure_user_profile()
--
-- Bug 1 (first-login leak): ensure_user_profile() runs as SECURITY DEFINER, but
-- its SELECT from public.pending_invitations is still subject to RLS. The
-- invoker is a brand-new auth user (no role yet), so the policy
-- pending_invitations_select returns zero rows. The function falls through to
-- Path 3 and writes role='parent' / school_id=NULL. The invitation is never
-- consumed. Fix: SET row_security = off on the function so the lookup works.
--
-- Bug 2 (stuck users): Path 1 short-circuited on any existing public.users row,
-- which means users wrongly auto-created as 'parent / NULL school' could never
-- recover even after the function was repaired. Fix: when the existing profile
-- is the legacy 'parent / NULL school' stub, fall through to invitation
-- consumption instead of returning it.

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS TABLE(role_key text, school_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
  v_school uuid;
  v_full_name text;
  v_inv_id uuid;
  v_existing_school uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT au.email::text INTO v_email FROM auth.users au WHERE au.id = v_uid;

  SELECT u.role_key, u.school_id INTO v_role, v_existing_school
  FROM public.users u
  WHERE u.id = v_uid AND u.deleted_at IS NULL
  LIMIT 1;

  -- Existing profile is meaningful (super_admin / school_admin / teacher, or a
  -- real parent already linked to a school). Return it.
  IF v_role IS NOT NULL AND NOT (v_role = 'parent' AND v_existing_school IS NULL) THEN
    role_key := v_role;
    school_id := v_existing_school;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Look for a pending invitation by email.
  IF v_email IS NOT NULL THEN
    SELECT pi.id, pi.role_key, pi.school_id, pi.full_name
      INTO v_inv_id, v_role, v_school, v_full_name
    FROM public.pending_invitations pi
    WHERE lower(pi.email) = lower(v_email) AND pi.consumed_at IS NULL
    ORDER BY pi.created_at DESC
    LIMIT 1;
  END IF;

  IF v_inv_id IS NOT NULL THEN
    INSERT INTO public.users (id, email, role_key, school_id, full_name)
    VALUES (v_uid, v_email, v_role, v_school, COALESCE(v_full_name, ''))
    ON CONFLICT (id) DO UPDATE SET role_key = EXCLUDED.role_key,
                                   school_id = EXCLUDED.school_id,
                                   full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.users.full_name),
                                   updated_at = now();

    IF v_role = 'teacher' THEN
      INSERT INTO public.teachers (user_id, school_id) VALUES (v_uid, v_school)
        ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id;
    ELSIF v_role = 'parent' THEN
      INSERT INTO public.parents (user_id, school_id) VALUES (v_uid, v_school)
        ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id;
    END IF;

    UPDATE public.pending_invitations SET consumed_at = now() WHERE id = v_inv_id;

    role_key := v_role;
    school_id := v_school;
    RETURN NEXT;
    RETURN;
  END IF;

  -- No invitation. Legacy fallback: parent with no school.
  -- Phase 2 (D2): replace with role='pending' + admin approval flow.
  INSERT INTO public.users (id, email, role_key, school_id)
  VALUES (v_uid, v_email, 'parent', NULL)
  ON CONFLICT (id) DO NOTHING;

  role_key := 'parent';
  school_id := NULL;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
