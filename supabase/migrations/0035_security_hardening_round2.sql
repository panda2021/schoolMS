-- Migration 0035: security hardening round 2 (audit 2026-07-06)

-- FIX (HIGH): parent cross-privacy leak on media_assets.
-- media_assets_select_school/_scope let ANY same-school user (incl. parents)
-- read every media_assets row, exposing other parents' private message/helpdesk
-- attachment object_paths. Split SELECT by role: staff/super keep school scope;
-- parents may only see rows tied to content they can already view. Because
-- storage_select_media_by_school checks EXISTS(media_assets ...), tightening
-- this also closes the storage-object leak (media_assets RLS applies in that
-- subquery for the querying role).
DROP POLICY IF EXISTS media_assets_select_school ON public.media_assets;
DROP POLICY IF EXISTS media_assets_select_scope  ON public.media_assets;

CREATE POLICY media_assets_select_staff ON public.media_assets
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR ((public.is_school_admin() OR public.is_teacher()) AND school_id = public.user_school_id())
  );

CREATE POLICY media_assets_select_parent ON public.media_assets
  FOR SELECT TO authenticated
  USING (
    public.is_parent() AND school_id = public.current_school_id() AND (
      uploaded_by = auth.uid()
      OR (message_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = media_assets.message_id
              AND m.parent_id = public.get_parent_id(auth.uid())))
      OR (helpdesk_message_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.helpdesk_messages hm
            JOIN public.helpdesk_tickets t ON t.id = hm.ticket_id
            WHERE hm.id = media_assets.helpdesk_message_id
              AND t.user_id = auth.uid()))
      OR (announcement_id IS NOT NULL AND public.parent_can_see_announcement(announcement_id))
      OR (daily_update_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.daily_updates du
            JOIN public.enrollments e ON e.class_id = du.class_id
            JOIN public.parent_students ps ON ps.student_id = e.student_id
            WHERE du.id = media_assets.daily_update_id
              AND ps.parent_id = public.get_parent_id(auth.uid())
              AND e.deleted_at IS NULL))
      OR (progress_report_id IS NOT NULL)  -- progress_reports are already school-visible; attachment visibility matches content
    )
  );

-- FIX (MEDIUM): staff media INSERT not path-scoped + redundant policy.
-- Drop the redundant, unscoped storage_insert_media_staff and consolidate into
-- one path-scoped INSERT policy (all upload paths are '<school_id>/<folder>/<uid>/...').
DROP POLICY IF EXISTS storage_insert_media_staff       ON storage.objects;
DROP POLICY IF EXISTS storage_insert_media_parent_chat ON storage.objects;
CREATE POLICY storage_insert_media ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media' AND (
      public.is_super_admin()
      OR ((public.is_teacher() OR public.is_school_admin())
          AND (storage.foldername(name))[1] = (public.user_school_id())::text)
      OR (public.is_parent() AND (
            name LIKE (public.current_school_id())::text || '/messages/%'
         OR name LIKE (public.current_school_id())::text || '/helpdesk/%'))
    )
  );

-- FIX (LOW-security): branding SELECT was fully open to authenticated (enumeration).
-- Scope to own-school prefix; super_admin unrestricted (needed for upload RETURNING
-- into any school's prefix). Public downloads still work via the bucket public flag.
DROP POLICY IF EXISTS storage_branding_select ON storage.objects;
CREATE POLICY storage_branding_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'branding' AND (
      public.is_super_admin()
      OR (storage.foldername(name))[1] = (public.user_school_id())::text
    )
  );

-- FIX (LOW): announcements duplicate policies with conflicting created_by semantics.
-- The app inserts created_by = auth.uid(), so the *_teacher_or_admin variants
-- (which expect created_by = teachers.id) never match app writes. Drop them.
DROP POLICY IF EXISTS announcements_insert_teacher_or_admin ON public.announcements;
DROP POLICY IF EXISTS announcements_update_author_or_admin  ON public.announcements;

-- FIX (LOW): is_in_same_school() treats two NULL-school users as same school.
CREATE OR REPLACE FUNCTION public.is_in_same_school(target_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  with me as (
    select school_id from public.users where id = auth.uid() and deleted_at is null
  ), target as (
    select school_id from public.users where id = target_user_id and deleted_at is null
  )
  select exists (
    select 1 from me m, target t
    where m.school_id = t.school_id and m.school_id is not null
  );
$function$;
