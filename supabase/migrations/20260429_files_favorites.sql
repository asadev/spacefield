-- Files Manager — Per-user favorites (starred files)
-- 2026-04-29
--
-- Tracks which workspace files a user has starred so the Launchpad
-- sidebar's "Favorites" section can render the user's pinned files
-- across sessions.
--
-- Composite PK on (user_id, file_id) prevents duplicate stars and
-- makes "is this starred for me?" a constant-time lookup.
--
-- RLS: a user can only see / insert / delete their own favorite rows.
-- The actual file content is gated by workspace_files RLS — favoriting
-- a file you can't see is harmless because the join in the GET route
-- returns nothing for unreachable file ids.

create table if not exists public.workspace_file_favorites (
  user_id      uuid not null references auth.users(id) on delete cascade,
  file_id      uuid not null references public.workspace_files(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, file_id)
);

create index if not exists workspace_file_favorites_user_ws_idx
  on public.workspace_file_favorites (user_id, workspace_id, created_at desc);

alter table public.workspace_file_favorites enable row level security;

drop policy if exists "users read own favorites" on public.workspace_file_favorites;
create policy "users read own favorites"
  on public.workspace_file_favorites for select
  using (user_id = auth.uid());

drop policy if exists "users insert own favorites" on public.workspace_file_favorites;
create policy "users insert own favorites"
  on public.workspace_file_favorites for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "users delete own favorites" on public.workspace_file_favorites;
create policy "users delete own favorites"
  on public.workspace_file_favorites for delete
  using (user_id = auth.uid());
