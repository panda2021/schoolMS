-- Migration 0021: Let teachers create and edit assessment_types
--
-- Previously only school_admin could insert/update/delete assessment_types,
-- which meant teachers couldn't enter grades when an admin hadn't pre-created
-- the assessment definitions. This migration grants teachers the ability to
-- manage assessment_types within their school.

DROP POLICY IF EXISTS at_insert ON public.assessment_types;
CREATE POLICY at_insert ON public.assessment_types FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND (public.is_school_admin() OR public.is_teacher() OR public.is_super_admin())
  );

DROP POLICY IF EXISTS at_update ON public.assessment_types;
CREATE POLICY at_update ON public.assessment_types FOR UPDATE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND (public.is_school_admin() OR public.is_teacher() OR public.is_super_admin())
  );

DROP POLICY IF EXISTS at_delete ON public.assessment_types;
CREATE POLICY at_delete ON public.assessment_types FOR DELETE TO authenticated
  USING (
    school_id = public.current_school_id()
    AND (public.is_school_admin() OR public.is_super_admin())
  );
