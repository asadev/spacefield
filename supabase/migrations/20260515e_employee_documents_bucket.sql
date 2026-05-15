-- 2026-05-15 employee-documents storage bucket.
--
-- Backlog Agent B-3 shipped lib/people/upload-doc.ts which writes to a
-- Supabase Storage bucket called 'employee-documents'. Inspector found
-- the bucket isn't created anywhere — POST /api/people/documents/upload
-- 500s today. This migration creates the bucket + RLS policies.
--
-- Path convention: employees/{employee_id}/{uuid}-{filename}
-- Cap: 10 MiB per file (mirrors the EMPLOYEE_DOCUMENT_MAX_BYTES const
-- in lib/people/upload-doc.ts).
--
-- Access:
--   - Workspace members can SELECT objects for any employee in their
--     workspace. (HR-grade tighter restriction is in scan-sc-005's
--     follow-up — that's a separate column-encryption + role-gate fix.)
--   - Workspace members can INSERT under employees/<employee_id>/...
--     only if the employee row exists in a workspace they're a member of.
--   - Workspace admins can DELETE.
--
-- Rollback:
--   drop policy if exists "employee-documents_workspace_read" on storage.objects;
--   drop policy if exists "employee-documents_workspace_write" on storage.objects;
--   drop policy if exists "employee-documents_workspace_delete" on storage.objects;
--   delete from storage.buckets where id = 'employee-documents';

-- Bucket (private — accessed via authenticated client only)
insert into storage.buckets (id, name, public, file_size_limit)
values ('employee-documents', 'employee-documents', false, 10485760) -- 10 MiB cap
on conflict (id) do nothing;

-- Helper: extract employee_id (first path segment after 'employees/')
-- Path format: employees/<employee_id>/<uuid>-<filename>
-- storage.foldername(name) returns text[]; we want index 2 (employee_id).

-- Read: any workspace member can read documents for employees in their workspace
drop policy if exists "employee-documents_workspace_read" on storage.objects;
create policy "employee-documents_workspace_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'employee-documents'
    and exists (
      select 1
      from public.employees e
      where e.id::text = (storage.foldername(name))[2]
        and public.is_workspace_member(e.workspace_id)
    )
  );

-- Write: any workspace member can upload for any employee in their workspace
drop policy if exists "employee-documents_workspace_write" on storage.objects;
create policy "employee-documents_workspace_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'employee-documents'
    and exists (
      select 1
      from public.employees e
      where e.id::text = (storage.foldername(name))[2]
        and public.is_workspace_member(e.workspace_id)
    )
  );

-- Delete: workspace owners + admins only
drop policy if exists "employee-documents_workspace_delete" on storage.objects;
create policy "employee-documents_workspace_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'employee-documents'
    and exists (
      select 1
      from public.employees e
      where e.id::text = (storage.foldername(name))[2]
        and public.workspace_role_of(e.workspace_id) in ('owner', 'admin')
    )
  );
