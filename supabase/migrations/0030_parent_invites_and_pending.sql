-- Migration 0030: Parent onboarding + pending-approval for uninvited logins (D2)
--
-- Fixes the two structural gaps in the parent model (audit 2026-07-02, see
-- docs/PROGRESS.md):
--   Gap 1: no invite-parent path. Invitations can now carry the student(s) the
--          parent should be linked to, so the link is created automatically at
--          first login ("when to assign" = at invite time, by the admin).
--   Gap 2: ghost accounts. Uninvited logins used to become
--          role='parent'/school_id=NULL and get stuck invisibly. They now
--          become role='pending' and land on a "Pending approval" screen;
--          the super admin approves (assign role + school) or rejects from
--          the dashboard. Existing ghosts are migrated to 'pending'.
--
-- Also: parents.* capabilities for the Phase 2 matrix, and a sane CHECK on
-- parent_students.relation.

-- ---------------------------------------------------------------------------
-- 1. New role for uninvited users awaiting approval
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (key, label) VALUES ('pending', 'Pending Approval')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Invitations can carry students to auto-link (parents only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pending_invitations
  ADD COLUMN IF NOT EXISTS student_ids uuid[],
  ADD COLUMN IF NOT EXISTS relation text;

-- ---------------------------------------------------------------------------
-- 3. Constrain parent_students.relation (was free text)
-- ---------------------------------------------------------------------------
UPDATE public.parent_students
SET relation = 'guardian'
WHERE relation IS NOT NULL
  AND relation NOT IN ('mother', 'father', 'guardian', 'other');

ALTER TABLE public.parent_students
  DROP CONSTRAINT IF EXISTS parent_students_relation_check;
ALTER TABLE public.parent_students
  ADD CONSTRAINT parent_students_relation_check
  CHECK (relation IS NULL OR relation IN ('mother', 'father', 'guardian', 'other'));

-- ---------------------------------------------------------------------------
-- 4. Capability catalog: parents management (Phase 2 framework)
-- ---------------------------------------------------------------------------
INSERT INTO public.features (key, feature, action, label, sort_order) VALUES
  ('parents.view',   'parents', 'view',   'View parents',                 25),
  ('parents.invite', 'parents', 'invite', 'Invite parents',               26),
  ('parents.edit',   'parents', 'edit',   'Link/unlink parent children',  27)
ON CONFLICT (key) DO UPDATE
  SET feature = EXCLUDED.feature,
      action  = EXCLUDED.action,
      label   = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order;

INSERT INTO public.role_features (role_key, feature_key) VALUES
  ('school_admin', 'parents.view'),
  ('school_admin', 'parents.invite'),
  ('school_admin', 'parents.edit')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. ensure_user_profile: consume student links; fall back to 'pending'
--    (replaces the 0025 version; keeps its RLS bypass + stuck-stub recovery,
--    and extends the stub fall-through to 'pending' users so a later
--    invitation is consumed on their next login)
-- ---------------------------------------------------------------------------
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
  v_student_ids uuid[];
  v_relation text;
  v_parent_id uuid;
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
  -- real parent already linked to a school). Return it. 'pending' users and
  -- legacy 'parent / NULL school' stubs fall through so an invitation created
  -- after their first login is consumed on the next one.
  IF v_role IS NOT NULL
     AND v_role <> 'pending'
     AND NOT (v_role = 'parent' AND v_existing_school IS NULL) THEN
    role_key := v_role;
    school_id := v_existing_school;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Look for a pending invitation by email.
  IF v_email IS NOT NULL THEN
    SELECT pi.id, pi.role_key, pi.school_id, pi.full_name, pi.student_ids, pi.relation
      INTO v_inv_id, v_role, v_school, v_full_name, v_student_ids, v_relation
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
        ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id
        RETURNING id INTO v_parent_id;

      -- Auto-link the students named on the invitation. Only students of the
      -- inviting school count; anything else on the array is ignored.
      IF v_student_ids IS NOT NULL AND array_length(v_student_ids, 1) > 0 THEN
        INSERT INTO public.parent_students (parent_id, student_id, relation)
        SELECT v_parent_id, s.id, v_relation
        FROM public.students s
        WHERE s.id = ANY(v_student_ids)
          AND s.school_id = v_school
          AND s.deleted_at IS NULL
        ON CONFLICT (parent_id, student_id) DO NOTHING;
      END IF;
    END IF;

    UPDATE public.pending_invitations SET consumed_at = now() WHERE id = v_inv_id;

    role_key := v_role;
    school_id := v_school;
    RETURN NEXT;
    RETURN;
  END IF;

  -- No invitation: pending approval (D2). The frontend shows the
  -- "awaiting approval" screen; the super admin approves or rejects.
  INSERT INTO public.users (id, email, role_key, school_id)
  VALUES (v_uid, v_email, 'pending', NULL)
  ON CONFLICT (id) DO UPDATE SET role_key = 'pending', updated_at = now();

  role_key := 'pending';
  school_id := NULL;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Migrate existing ghost accounts to 'pending' so they surface in the
--    approval queue (role='parent', no school, no parents row)
-- ---------------------------------------------------------------------------
UPDATE public.users u
SET role_key = 'pending', updated_at = now()
WHERE u.role_key = 'parent'
  AND u.school_id IS NULL
  AND u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.parents p WHERE p.user_id = u.id);

-- ---------------------------------------------------------------------------
-- 7. Approve / reject RPCs (super_admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_pending_user(target_user_id uuid, new_role text, target_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can approve pending users';
  END IF;
  IF new_role NOT IN ('teacher', 'parent', 'school_admin') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = target_school_id) THEN
    RAISE EXCEPTION 'School not found';
  END IF;

  UPDATE public.users
  SET role_key = new_role, school_id = target_school_id, updated_at = now()
  WHERE id = target_user_id AND role_key = 'pending' AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found or not pending approval';
  END IF;

  IF new_role = 'teacher' THEN
    INSERT INTO public.teachers (user_id, school_id) VALUES (target_user_id, target_school_id)
      ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id, deleted_at = NULL;
  ELSIF new_role = 'parent' THEN
    INSERT INTO public.parents (user_id, school_id) VALUES (target_user_id, target_school_id)
      ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id, deleted_at = NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_pending_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can reject pending users';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = target_user_id AND role_key = 'pending' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User not found or not pending approval';
  END IF;

  -- Remove the auth account entirely; public.users cascades via FK.
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_pending_user(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_pending_user(uuid) TO authenticated;
