-- Custom wallpapers — admin-uploaded desktop backgrounds for /tools.
-- 2026-04-28
--
-- Pairs with public/wallpapers/* (light + dark variants per slug) and
-- the wallpaper-registry / wallpaper-resolver client modules. Admins
-- upload via /admin/wallpapers; any signed-in user can list and apply.
-- Storage of the actual files is in R2 — only URLs and metadata live
-- here.

create table if not exists public.wallpapers (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  category        text not null default 'custom',
  light_url       text,
  dark_url        text,
  mode_preference text not null default 'auto',  -- 'auto' | 'light' | 'dark'
  created_by      uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now()
);

alter table public.wallpapers enable row level security;

drop policy if exists "anyone reads wallpapers" on public.wallpapers;
create policy "anyone reads wallpapers"
  on public.wallpapers for select
  using (auth.role() = 'authenticated');

drop policy if exists "admins write wallpapers" on public.wallpapers;
create policy "admins write wallpapers"
  on public.wallpapers for all
  using (
    exists (
      select 1 from public.profiles
      where user_id = auth.uid() and is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where user_id = auth.uid() and is_admin = true
    )
  );
