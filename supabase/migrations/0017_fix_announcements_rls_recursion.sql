-- Migration 0017: Fix infinite recursion (42P17) on announcements
--
-- Cause: announcements_select_scope evaluates EXISTS over announcement_recipients,
-- and announcement_recipients_select evaluates EXISTS over announcements. Each
-- subquery re-applies RLS on the other table -> infinite recursion.
--
-- Fix: Wrap the cross-table checks in SECURITY DEFINER helper functions.
-- A SECURITY DEFINER function reads its target tables with the function owner's
-- privileges and does not re-evaluate the caller's row-level policies.

-- ============================================================
-- 1. Helper: does the current user (parent) have visibility on
--    a given announcement via class enrollment OR explicit recipient?
-- ============================================================
CREATE OR REPLACE FUNCTION public.parent_can_see_announcement(p_announcement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ann AS (
    SELECT id, class_id
    FROM public.announcements
    WHERE id = p_announcement_id
  ),
  parent AS (
    SELECT public.get_parent_id(auth.uid()) AS pid
  )
  SELECT EXISTS (
    -- school-wide (no class, no targeted recipients)
    SELECT 1 FROM ann
    WHERE ann.class_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.announcement_recipients ar WHERE ar.announcement_id = ann.id
    )
  )
  OR EXISTS (
    -- class-scoped: parent's child enrolled in that class
    SELECT 1 FROM ann
    JOIN public.enrollments e ON e.class_id = ann.class_id AND e.deleted_at IS NULL
    JOIN public.parent_students ps ON ps.student_id = e.student_id
    JOIN parent ON ps.parent_id = parent.pid
  )
  OR EXISTS (
    -- explicit recipient
    SELECT 1 FROM public.announcement_recipients ar
    JOIN parent ON ar.parent_id = parent.pid
    WHERE ar.announcement_id = p_announcement_id
  );
$$;

-- ============================================================
-- 2. Helper: can the current user see this announcement_recipients row?
--    (admin/teacher in same school, or it's their own row as parent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_view_recipient_row(p_announcement_id uuid, p_parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ann AS (
    SELECT school_id FROM public.announcements WHERE id = p_announcement_id
  )
  SELECT
    public.is_super_admin()
    OR (
      EXISTS (SELECT 1 FROM ann WHERE ann.school_id = public.current_school_id())
      AND (
        public.is_school_admin(auth.uid())
        OR public.is_teacher(auth.uid())
        OR p_parent_id = public.get_parent_id(auth.uid())
      )
    );
$$;

-- ============================================================
-- 3. Replace announcements SELECT policy (no inline EXISTS on recipients)
-- ============================================================
DROP POLICY IF EXISTS announcements_select_scope ON public.announcements;
CREATE POLICY announcements_select_scope ON public.announcements FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    public.is_super_admin()
    OR (
      school_id = public.current_school_id()
      AND (
        public.is_school_admin(auth.uid())
        OR public.is_teacher(auth.uid())
        OR (public.is_parent(auth.uid()) AND public.parent_can_see_announcement(announcements.id))
      )
    )
  )
);

-- ============================================================
-- 4. Replace announcement_recipients SELECT policy (no inline EXISTS on announcements)
-- ============================================================
DROP POLICY IF EXISTS announcement_recipients_select ON public.announcement_recipients;
CREATE POLICY announcement_recipients_select ON public.announcement_recipients FOR SELECT TO authenticated
USING (
  public.can_view_recipient_row(announcement_recipients.announcement_id, announcement_recipients.parent_id)
);

-- ============================================================
-- 5. Make sure helper grants are usable by authenticated role
-- ============================================================
GRANT EXECUTE ON FUNCTION public.parent_can_see_announcement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_recipient_row(uuid, uuid) TO authenticated;
