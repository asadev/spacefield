-- ─────────────────────────────────────────────────────────────────────────
-- toShare public bucket — for poster images and other content that
-- needs to be displayed inside <img> tags on public viewer pages.
--
-- Different from `toshare-files` which is private (signed URLs only).
-- This bucket is public-read so URLs work in any browser without
-- authentication.
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('toshare-public', 'toshare-public', true, 10485760) -- 10MB cap per file
on conflict (id) do update set public = true;

-- Authenticated users can upload to their own folder
create policy "toshare-public_owner_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'toshare-public'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read of any object in this bucket (so viewer URLs work for anon)
create policy "toshare-public_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'toshare-public');

create policy "toshare-public_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'toshare-public'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
