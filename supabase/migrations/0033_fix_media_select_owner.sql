-- Migration 0033: let uploaders SELECT their own media objects.
-- Storage API uploads use INSERT ... RETURNING, which requires the new row to
-- pass a SELECT policy. storage_select_media_by_school only matches once a
-- media_assets row exists (created after upload), so every media upload failed
-- RLS at upload time. Owner-scoped SELECT unblocks uploads without widening
-- read access: other users' downloads are still governed by
-- storage_select_media_by_school.
DROP POLICY IF EXISTS storage_media_select_own ON storage.objects;
CREATE POLICY storage_media_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND owner_id = (auth.uid())::text);
