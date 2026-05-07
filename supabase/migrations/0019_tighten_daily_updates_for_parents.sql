-- Migration 0019: Tighten daily_updates RLS for parents
--
-- Migration 0014 broadened the daily_updates SELECT policy to "same school",
-- which let parents read updates for classes their children are NOT enrolled in.
-- This restores per-parent scoping while preserving admin/teacher/super_admin
-- access.

DROP POLICY IF EXISTS daily_updates_select_scope ON public.daily_updates;
DROP POLICY IF EXISTS daily_updates_select ON public.daily_updates;

CREATE POLICY daily_updates_select_scope ON public.daily_updates FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      school_id = public.current_school_id()
      AND (
        public.is_school_admin(auth.uid())
        OR teacher_id = public.current_teacher_id()
        OR (
          public.is_parent(auth.uid())
          AND EXISTS (
            SELECT 1
            FROM public.enrollments e
            JOIN public.parent_students ps ON ps.student_id = e.student_id
            WHERE e.class_id = daily_updates.class_id
              AND ps.parent_id = public.get_parent_id(auth.uid())
              AND e.deleted_at IS NULL
          )
        )
      )
    )
  );
