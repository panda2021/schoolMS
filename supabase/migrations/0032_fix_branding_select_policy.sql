-- Migration 0032: SELECT policy for the branding bucket.
-- The storage API uploads with INSERT ... RETURNING; Postgres applies SELECT
-- policies to returned rows, so without this policy every branding upload
-- fails with "new row violates row-level security policy" even for super_admin.
-- (0028's assumption that the bucket's public flag makes a SELECT policy
-- unnecessary holds for downloads, not for uploads.)
-- Branding assets are public (bucket.public = true), so authenticated read is safe.
DROP POLICY IF EXISTS storage_branding_select ON storage.objects;
CREATE POLICY storage_branding_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'branding');
