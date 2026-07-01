-- Migration 0028: Per-school branding (Phase 3 of the personalization plan)
-- Adds logo, two-color theme, and a background image + opacity per school. [D5]
-- Branding is applied AFTER login (the signed-in user's school drives it); tying
-- it to the login page/subdomain is future work. The super-admin edit-school modal
-- exposes these fields so branding can be tested on already-created schools. [D5]

-- ---------------------------------------------------------------------------
-- 1. Branding columns on schools
-- ---------------------------------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS logo_url        text,
  ADD COLUMN IF NOT EXISTS primary_color   text,   -- '#rrggbb'
  ADD COLUMN IF NOT EXISTS secondary_color text,   -- '#rrggbb' (accent)
  ADD COLUMN IF NOT EXISTS bg_image_url    text,
  ADD COLUMN IF NOT EXISTS bg_opacity      numeric NOT NULL DEFAULT 0.08
    CHECK (bg_opacity >= 0 AND bg_opacity <= 1);

-- ---------------------------------------------------------------------------
-- 2. Public storage bucket for branding assets (logos, backgrounds)
--    Public read: these are non-sensitive and shown via <img src> without auth.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branding', 'branding', true, 5242880, array['image/*'])
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Write policies on storage.objects for the branding bucket.
--    Objects are stored under '<school_id>/...'. super_admin may write any
--    school's assets; a school_admin may write only their own school's folder.
--    (SELECT is served publicly by the bucket's public flag — no policy needed.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS storage_branding_insert ON storage.objects;
CREATE POLICY storage_branding_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding' AND (
      public.is_super_admin()
      OR (public.is_school_admin() AND (storage.foldername(name))[1] = public.current_school_id()::text)
    )
  );

DROP POLICY IF EXISTS storage_branding_update ON storage.objects;
CREATE POLICY storage_branding_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding' AND (
      public.is_super_admin()
      OR (public.is_school_admin() AND (storage.foldername(name))[1] = public.current_school_id()::text)
    )
  )
  WITH CHECK (
    bucket_id = 'branding' AND (
      public.is_super_admin()
      OR (public.is_school_admin() AND (storage.foldername(name))[1] = public.current_school_id()::text)
    )
  );

DROP POLICY IF EXISTS storage_branding_delete ON storage.objects;
CREATE POLICY storage_branding_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding' AND (
      public.is_super_admin()
      OR (public.is_school_admin() AND (storage.foldername(name))[1] = public.current_school_id()::text)
    )
  );
