-- Migration 0018: Allow parents to upload attachments for their messages and helpdesk tickets
--
-- Original 0003 storage policy only allowed teachers/admins to insert into the
-- `media` bucket. Parents got 403 when attaching files in chat.
--
-- This migration:
--   1. Adds storage.objects INSERT policy permitting authenticated users (parents
--      included) to upload to paths under their own school + a safe folder
--      (`messages/` or `helpdesk/`).
--   2. Adds media_assets INSERT policy permitting parents to register their
--      uploaded asset, scoped to messages/helpdesk they participate in.

-- ============================================================
-- 1. Storage.objects: parent-friendly insert policy
-- ============================================================
DROP POLICY IF EXISTS storage_insert_media_parent_chat ON storage.objects;
CREATE POLICY storage_insert_media_parent_chat ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (
      -- existing staff path still works
      public.is_teacher() OR public.is_school_admin() OR public.is_super_admin()
      -- parents may upload to their school's messages/ or helpdesk/ namespace
      OR (
        public.is_parent()
        AND (
          name LIKE (public.current_school_id()::text || '/messages/%')
          OR name LIKE (public.current_school_id()::text || '/helpdesk/%')
        )
      )
    )
  );

-- ============================================================
-- 2. media_assets: parent insert (for messages and helpdesk)
-- ============================================================
DROP POLICY IF EXISTS media_assets_insert_parent ON public.media_assets;
CREATE POLICY media_assets_insert_parent ON public.media_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = public.current_school_id()
    AND public.is_parent()
    AND (
      -- attaching to a message thread the parent is part of
      EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.id = media_assets.message_id
          AND m.parent_id = public.get_parent_id(auth.uid())
      )
      -- helpdesk attachment will be validated via helpdesk RLS in 0019
      OR media_assets.message_id IS NULL  -- defer to message_id NULL + helpdesk path
    )
  );

-- ============================================================
-- 3. media_assets: super_admin insert (for helpdesk replies, etc.)
-- ============================================================
DROP POLICY IF EXISTS media_assets_insert_super ON public.media_assets;
CREATE POLICY media_assets_insert_super ON public.media_assets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());
