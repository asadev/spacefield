-- Cross-workspace file sharing
-- 2026-04-29
--
-- Lets a member of workspace A share a specific file with workspace B.
-- The original file row stays in workspace A — workspace B reads it
-- through the share row, not through workspace_files membership.
--
-- Permission column is stored but enforcement of "edit" is deferred to
-- a later sprint; v1 only surfaces "view" semantics.

create table if not exists public.workspace_file_shares (
  id                    uuid primary key default gen_random_uuid(),
  file_id               uuid not null references public.workspace_files(id) on delete cascade,
  source_workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  target_workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  shared_by             uuid references auth.users(id) on delete set null,
  permission            text not null default 'view'
                          check (permission in ('view','edit')),
  message               text,
  created_at            timestamptz not null default now(),
  unique (file_id, target_workspace_id)
);

create index if not exists workspace_file_shares_target_idx
  on public.workspace_file_shares (target_workspace_id, created_at desc);
create index if not exists workspace_file_shares_file_idx
  on public.workspace_file_shares (file_id);
create index if not exists workspace_file_shares_source_idx
  on public.workspace_file_shares (source_workspace_id, created_at desc);

alter table public.workspace_file_shares enable row level security;

-- SELECT — any member of source OR target sees the row.
drop policy if exists "members of source or target read shares"
  on public.workspace_file_shares;
create policy "members of source or target read shares"
  on public.workspace_file_shares for select
  using (
    public.is_workspace_member(source_workspace_id)
    or public.is_workspace_member(target_workspace_id)
  );

-- INSERT — only members of the source workspace can create a share.
-- shared_by must be the caller (auth.uid()).
drop policy if exists "source members create shares"
  on public.workspace_file_shares;
create policy "source members create shares"
  on public.workspace_file_shares for insert
  to authenticated
  with check (
    public.is_workspace_member(source_workspace_id)
    and shared_by = auth.uid()
  );

-- UPDATE — only members of the source workspace (e.g. change permission
-- or message). The check clause keeps source/target/file immutable from
-- the client side: a row's source_workspace_id can't be swapped via UPDATE.
drop policy if exists "source members update shares"
  on public.workspace_file_shares;
create policy "source members update shares"
  on public.workspace_file_shares for update
  using (public.is_workspace_member(source_workspace_id))
  with check (public.is_workspace_member(source_workspace_id));

-- DELETE — only members of the source workspace can revoke. The target
-- workspace can hide the row in their UI but cannot remove it from the
-- DB; the share belongs to the sender.
drop policy if exists "source members delete shares"
  on public.workspace_file_shares;
create policy "source members delete shares"
  on public.workspace_file_shares for delete
  using (public.is_workspace_member(source_workspace_id));

-- Workspace_files RLS extension — let target-workspace members read the
-- shared file's metadata even though they aren't members of the
-- file's owning workspace. The existing "members read workspace files"
-- policy stays in place; we add a second permissive SELECT policy that
-- ORs in the share-row check. Postgres OR-combines permissive SELECT
-- policies so this widens visibility without breaking the existing one.
drop policy if exists "target members read shared files"
  on public.workspace_files;
create policy "target members read shared files"
  on public.workspace_files for select
  using (
    exists (
      select 1 from public.workspace_file_shares s
      where s.file_id = workspace_files.id
        and public.is_workspace_member(s.target_workspace_id)
    )
  );
