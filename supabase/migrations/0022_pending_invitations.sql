-- Migration 0022: Pending invitations for admin-driven teacher (and parent) onboarding
--
-- A school admin enters an email + name + role; we record a pending_invitations
-- row and email the user a magic link via Supabase Auth from the client.
-- When the invited user signs in, ensure_user_profile() consumes the pending
-- invitation and provisions their public.users + teachers/parents rows.

CREATE TABLE IF NOT EXISTS public.pending_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role_key text NOT NULL CHECK (role_key IN ('teacher', 'parent', 'school_admin')),
  full_name text,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  UNIQUE (email, school_id)
);
CREATE INDEX IF NOT EXISTS idx_pending_invitations_email ON public.pending_invitations(lower(email));

ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

-- Admin and super_admin can manage invitations within their school
CREATE POLICY pending_invitations_select ON public.pending_invitations FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_school_admin() AND school_id = public.current_school_id())
  );

CREATE POLICY pending_invitations_insert ON public.pending_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_school_admin() AND school_id = public.current_school_id())
  );

CREATE POLICY pending_invitations_delete ON public.pending_invitations FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_school_admin() AND school_id = public.current_school_id())
  );

-- Replace ensure_user_profile to consume pending invitations
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS TABLE(role_key text, school_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
  v_school uuid;
  v_full_name text;
  v_inv_id uuid;
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

  -- Need email to look up invitations
  SELECT au.email::text INTO v_email FROM auth.users au WHERE au.id = v_uid;

  -- Path 2: consume pending invitation if any
  IF v_email IS NOT NULL THEN
    SELECT id, role_key, school_id, full_name INTO v_inv_id, v_role, v_school, v_full_name
    FROM public.pending_invitations
    WHERE lower(email) = lower(v_email) AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_role IS NOT NULL THEN
    -- Create the user row with the invited role + school
    INSERT INTO public.users (id, email, role_key, school_id, full_name)
    VALUES (v_uid, v_email, v_role, v_school, COALESCE(v_full_name, ''))
    ON CONFLICT (id) DO UPDATE SET role_key = EXCLUDED.role_key,
                                   school_id = EXCLUDED.school_id,
                                   full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
                                   updated_at = now();

    -- Create the role-specific row
    IF v_role = 'teacher' THEN
      INSERT INTO public.teachers (user_id, school_id) VALUES (v_uid, v_school)
        ON CONFLICT (user_id) DO NOTHING;
    ELSIF v_role = 'parent' THEN
      INSERT INTO public.parents (user_id, school_id) VALUES (v_uid, v_school)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    -- Mark invitation consumed
    UPDATE public.pending_invitations SET consumed_at = now() WHERE id = v_inv_id;

    role_key := v_role;
    school_id := v_school;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Path 3: brand new user, no invitation. Default to parent / no school.
  INSERT INTO public.users (id, email, role_key, school_id)
  VALUES (v_uid, v_email, 'parent', NULL)
  ON CONFLICT (id) DO NOTHING;

  role_key := 'parent';
  school_id := NULL;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- Helper to add a `users.email` column if it doesn't exist (for ensure_user_profile)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users(lower(email));
