-- Plans + quotas + file metadata
-- 2026-04-27
--
-- Tiers and quotas for Space Field. Files themselves live in Cloudflare
-- R2 (bucket "spacefield-files") — only metadata + size sit in Postgres.
--
-- Tier limits:
--   free:  1 owned workspace, 100 MB per workspace, 5 members per workspace,
--          unlimited joined workspaces.
--   pro:   5 owned, 5 GB per workspace, 25 members, advanced tools.
--   team:  25 owned, 50 GB per workspace, unlimited members, admin sharing.
--   enterprise: bespoke.
--
-- Default tier on signup: free.

create extension if not exists "pgcrypto";

-- ────────────────────────── tier definition ──────────────────────────
create table if not exists public.subscription_tiers (
  tier_id                     text primary key,
  name                        text not null,
  price_cents_monthly         integer not null default 0,
  price_cents_yearly          integer not null default 0,
  max_owned_workspaces        integer not null default 1,
  max_storage_per_workspace_mb integer not null default 100,
  max_members_per_workspace   integer not null default 5,
  features                    jsonb not null default '{}'::jsonb,
  is_public                   boolean not null default true,
  sort_order                  integer not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.subscription_tiers enable row level security;

drop policy if exists "anyone reads public tiers" on public.subscription_tiers;
create policy "anyone reads public tiers"
  on public.subscription_tiers for select
  using (is_public);

insert into public.subscription_tiers
  (tier_id, name, price_cents_monthly, price_cents_yearly,
   max_owned_workspaces, max_storage_per_workspace_mb, max_members_per_workspace,
   features, sort_order)
values
  ('free', 'Free', 0, 0,
   1, 100, 5,
   '{"file_manager":true,"basic_tools":true,"shared_workspaces":true,"google_signin":true,"sync":true}'::jsonb, 0),
  ('pro', 'Pro', 1900, 19000,
   5, 5120, 25,
   '{"file_manager":true,"basic_tools":true,"shared_workspaces":true,"google_signin":true,"sync":true,"premium_tools":true,"priority_support":true,"export":true}'::jsonb, 10),
  ('team', 'Team', 4900, 49000,
   25, 51200, 999,
   '{"file_manager":true,"basic_tools":true,"shared_workspaces":true,"google_signin":true,"sync":true,"premium_tools":true,"priority_support":true,"export":true,"admin_console":true,"sso":false,"audit_log":true}'::jsonb, 20),
  ('enterprise', 'Enterprise', 0, 0,
   999, 1048576, 9999,
   '{"file_manager":true,"basic_tools":true,"shared_workspaces":true,"google_signin":true,"sync":true,"premium_tools":true,"priority_support":true,"export":true,"admin_console":true,"sso":true,"audit_log":true,"custom_contracts":true}'::jsonb, 30)
on conflict (tier_id) do update set
  name                         = excluded.name,
  price_cents_monthly          = excluded.price_cents_monthly,
  price_cents_yearly           = excluded.price_cents_yearly,
  max_owned_workspaces         = excluded.max_owned_workspaces,
  max_storage_per_workspace_mb = excluded.max_storage_per_workspace_mb,
  max_members_per_workspace    = excluded.max_members_per_workspace,
  features                     = excluded.features,
  sort_order                   = excluded.sort_order,
  updated_at                   = now();

-- ────────────────────────── subscriptions ──────────────────────────
create table if not exists public.subscriptions (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  tier_id     text not null references public.subscription_tiers(tier_id),
  status      text not null default 'active',  -- active | trialing | past_due | canceled
  started_at  timestamptz not null default now(),
  expires_at  timestamptz,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "users read own subscription" on public.subscriptions;
create policy "users read own subscription"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- Updates / inserts for subscriptions are server-only (admin / billing
-- webhook). No anon/authenticated INSERT or UPDATE policy.

-- Auto-create a free subscription on every new user.
create or replace function public.handle_new_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, tier_id)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_subscribe on auth.users;
create trigger on_auth_user_subscribe
  after insert on auth.users
  for each row execute function public.handle_new_subscription();

-- Backfill existing users who don't yet have a subscription row.
insert into public.subscriptions (user_id, tier_id)
select id, 'free' from auth.users
on conflict (user_id) do nothing;

-- Helper: get the calling user's tier_id (defaults to 'free').
create or replace function public.my_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tier_id from public.subscriptions where user_id = auth.uid() limit 1),
    'free'
  );
$$;
grant execute on function public.my_tier() to authenticated;

-- ────────────────────────── tier-limit enforcement ──────────────────────────
-- Block workspace creation if the user has reached their owned-workspace
-- cap for their tier.
create or replace function public.enforce_workspace_owner_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap   integer;
  owned integer;
  tier  text;
begin
  select tier_id into tier from public.subscriptions where user_id = new.user_id;
  if tier is null then tier := 'free'; end if;
  select max_owned_workspaces into cap from public.subscription_tiers where tier_id = tier;
  if cap is null then cap := 1; end if;
  select count(*) into owned from public.workspaces where user_id = new.user_id;
  if owned >= cap then
    raise exception 'workspace limit reached for tier %', tier
      using errcode = 'P0001', hint = 'upgrade_to_create_more_workspaces';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_owner_quota on public.workspaces;
create trigger workspace_owner_quota
  before insert on public.workspaces
  for each row execute function public.enforce_workspace_owner_quota();

-- ────────────────────────── workspace_files (metadata) ──────────────────────────
-- Each row = one object in R2. Bytes live in R2 (key = the R2 object key);
-- everything else (size, name, owner, workspace) lives here.

create table if not exists public.workspace_files (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- R2 object key: <workspaceId>/<fileId>/<safeName>
  r2_key        text not null,
  name          text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  content_type  text,
  created_at    timestamptz not null default now()
);

create index if not exists workspace_files_ws_idx on public.workspace_files(workspace_id, created_at desc);
create index if not exists workspace_files_user_idx on public.workspace_files(user_id);

alter table public.workspace_files enable row level security;

drop policy if exists "members read workspace files" on public.workspace_files;
create policy "members read workspace files"
  on public.workspace_files for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "members insert files (with quota)" on public.workspace_files;
create policy "members insert files (with quota)"
  on public.workspace_files for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

-- Members can delete files they uploaded; admins/owners can delete any.
drop policy if exists "members delete own files; admins any" on public.workspace_files;
create policy "members delete own files; admins any"
  on public.workspace_files for delete
  using (
    (user_id = auth.uid() and public.is_workspace_member(workspace_id))
    or public.workspace_role_of(workspace_id) in ('owner','admin')
  );

-- ────────────────────────── quota check fn ──────────────────────────
-- Returns the workspace's storage cap (in bytes) and used (in bytes).
-- Capped at the OWNER's tier — not the caller's. So a free-tier owner's
-- workspace is 100 MB even if a Pro member joins.
create or replace function public.workspace_storage(ws_id uuid)
returns table (
  cap_bytes  bigint,
  used_bytes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with owner as (
    select user_id from public.workspaces where id = ws_id
  ), owner_tier as (
    select coalesce(s.tier_id, 'free') as tier_id from owner o
    left join public.subscriptions s on s.user_id = o.user_id
  ), cap as (
    select (t.max_storage_per_workspace_mb::bigint * 1024 * 1024) as cap_bytes
    from owner_tier ot
    join public.subscription_tiers t on t.tier_id = ot.tier_id
  ), used as (
    select coalesce(sum(size_bytes), 0)::bigint as used_bytes
    from public.workspace_files
    where workspace_id = ws_id
  )
  select c.cap_bytes, u.used_bytes from cap c, used u;
$$;
grant execute on function public.workspace_storage(uuid) to authenticated;
