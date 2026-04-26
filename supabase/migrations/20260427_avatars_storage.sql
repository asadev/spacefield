-- spacefield avatars bucket — storage RLS
-- 2026-04-27
--
-- Bucket created via storage API (public read, 2MB limit, image/* mime).
-- Policies below let any authenticated user upload / replace / delete a
-- file whose name starts with their own user id (e.g. `<uid>.webp`,
-- `<uid>.png`). Reads are public (the bucket is public).

-- Allow authenticated users to insert their own avatar files
drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (split_part(name, '.', 1)) = auth.uid()::text
  );

-- Allow authenticated users to update / replace their own avatar
drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (split_part(name, '.', 1)) = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (split_part(name, '.', 1)) = auth.uid()::text
  );

-- Allow authenticated users to delete their own avatar
drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (split_part(name, '.', 1)) = auth.uid()::text
  );

-- Public read is granted by the bucket itself (public: true), so no
-- explicit SELECT policy needed. Anyone with the URL can fetch.
