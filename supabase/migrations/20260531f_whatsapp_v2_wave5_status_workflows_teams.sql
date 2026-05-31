-- WhatsApp Inbox v2 — Wave 5 (FINAL)
-- EPIC-18 Status posting + product picker
-- EPIC-19 Visual workflow builder + drip sequences + AI-in-flow
-- EPIC-20 Multi-number + teams + auto-assignment + role-based access
-- Idempotent. RLS recipe matches Waves 1-4.

begin;

-- =========================================================================
-- EPIC-20: relax single-instance-per-workspace + add routing columns
-- =========================================================================
-- The live constraint is whatsapp_instances_workspace_id_key UNIQUE (workspace_id).
-- Drop it so a workspace can connect multiple Evolution instances (sales/support).
do $$ begin
  if exists (
    select 1 from pg_constraint where conname = 'whatsapp_instances_workspace_id_key'
  ) then
    alter table public.whatsapp_instances drop constraint whatsapp_instances_workspace_id_key;
  end if;
end $$;

-- Per-number routing metadata.
alter table public.whatsapp_instances add column if not exists label text;
alter table public.whatsapp_instances add column if not exists role text not null default 'general';
alter table public.whatsapp_instances add column if not exists is_default boolean not null default false;
-- Per-instance auto-assignment config (EPIC-20).
alter table public.whatsapp_instances add column if not exists auto_assign_enabled boolean not null default false;
alter table public.whatsapp_instances add column if not exists auto_assign_strategy text not null default 'round_robin';
alter table public.whatsapp_instances add column if not exists auto_assign_team_id uuid;
alter table public.whatsapp_instances add column if not exists last_assigned_user_id uuid;

-- Keep a non-unique index for fast per-workspace instance lookups.
create index if not exists whatsapp_instances_workspace_idx on public.whatsapp_instances (workspace_id);

-- =========================================================================
-- EPIC-18: products catalog (lightweight; fed from poster/inventory tools)
-- =========================================================================
create table if not exists public.whatsapp_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  description text,
  price numeric,
  currency text not null default 'PKR',
  sku text,
  media_storage_path text,
  media_url text,
  order_link text,
  source text,           -- 'manual' | 'inventory' | 'poster'
  source_id text,        -- originating inventory_items.id etc.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_products enable row level security;
do $$ begin
  create policy "ws members rw products" on public.whatsapp_products
    for all using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
    with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
exception when duplicate_object then null; end $$;
create index if not exists whatsapp_products_workspace_idx on public.whatsapp_products (workspace_id);

-- =========================================================================
-- EPIC-18: status posts (scheduled WhatsApp Status; drained through queue)
-- =========================================================================
create table if not exists public.whatsapp_status_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  instance_id uuid not null,
  kind text not null default 'text',     -- 'text' | 'image' | 'video'
  caption text,
  text_content text,
  media_url text,
  background_color text,
  font integer,
  status text not null default 'draft',   -- 'draft' | 'scheduled' | 'queued' | 'sent' | 'failed'
  scheduled_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_status_posts enable row level security;
do $$ begin
  create policy "ws members rw status_posts" on public.whatsapp_status_posts
    for all using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
    with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
exception when duplicate_object then null; end $$;
create index if not exists whatsapp_status_posts_due_idx
  on public.whatsapp_status_posts (status, scheduled_at);

-- =========================================================================
-- EPIC-19: workflows (visual/step-list builder over the shared executor)
-- =========================================================================
create table if not exists public.whatsapp_workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  description text,
  trigger text not null default 'inbound_message',
  -- graph jsonb: { nodes:[{id,type,...}], edges:[{from,to,when}] } OR step-list equivalent
  graph jsonb not null default '{"nodes":[],"edges":[]}',
  recipe_key text,        -- which prebuilt recipe this was cloned from (nullable)
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_workflows enable row level security;
do $$ begin
  create policy "ws members rw workflows" on public.whatsapp_workflows
    for all using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
    with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
exception when duplicate_object then null; end $$;
create index if not exists whatsapp_workflows_workspace_idx on public.whatsapp_workflows (workspace_id);

-- =========================================================================
-- EPIC-19: drip sequences + enrollments
-- =========================================================================
create table if not exists public.whatsapp_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  description text,
  -- steps jsonb: [{ delay_minutes:int, actions:[WaAction] }]
  steps jsonb not null default '[]',
  -- exit_conditions jsonb: { on_reply:bool, on_label:uuid|null, ... }
  exit_conditions jsonb not null default '{"on_reply": true}',
  recipe_key text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_sequences enable row level security;
do $$ begin
  create policy "ws members rw sequences" on public.whatsapp_sequences
    for all using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
    with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
exception when duplicate_object then null; end $$;
create index if not exists whatsapp_sequences_workspace_idx on public.whatsapp_sequences (workspace_id);

create table if not exists public.whatsapp_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  sequence_id uuid not null,
  contact_id uuid,
  conversation_id uuid,
  instance_id uuid,
  remote_jid text,
  current_step integer not null default 0,
  status text not null default 'active',   -- 'active' | 'completed' | 'exited' | 'failed'
  next_run_at timestamptz,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text,
  unique (sequence_id, contact_id)
);
alter table public.whatsapp_sequence_enrollments enable row level security;
do $$ begin
  create policy "ws members rw seq_enrollments" on public.whatsapp_sequence_enrollments
    for all using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
    with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
exception when duplicate_object then null; end $$;
create index if not exists whatsapp_seq_enroll_due_idx
  on public.whatsapp_sequence_enrollments (status, next_run_at);

-- =========================================================================
-- EPIC-20: teams + members (capacity + presence)
-- =========================================================================
create table if not exists public.whatsapp_teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_teams enable row level security;
do $$ begin
  create policy "ws members rw teams" on public.whatsapp_teams
    for all using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
    with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
exception when duplicate_object then null; end $$;
create index if not exists whatsapp_teams_workspace_idx on public.whatsapp_teams (workspace_id);

create table if not exists public.whatsapp_team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  capacity integer not null default 10,
  presence text not null default 'available',   -- 'available' | 'away' | 'offline'
  active_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);
alter table public.whatsapp_team_members enable row level security;
do $$ begin
  create policy "ws members rw team_members" on public.whatsapp_team_members
    for all using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
    with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));
exception when duplicate_object then null; end $$;
create index if not exists whatsapp_team_members_team_idx on public.whatsapp_team_members (team_id);

-- =========================================================================
-- Service-role RPCs (drained by crons; revoke anon/authenticated)
-- =========================================================================

-- Claim due sequence enrollments (concurrency-safe).
create or replace function public.claim_due_enrollments(max_rows int)
returns setof public.whatsapp_sequence_enrollments
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.whatsapp_sequence_enrollments e
  set status = 'processing', updated_at = now()
  where e.id in (
    select id from public.whatsapp_sequence_enrollments
    where status = 'active'
      and next_run_at is not null
      and next_run_at <= now()
    order by next_run_at
    limit max_rows
    for update skip locked
  )
  returning e.*;
end;
$$;
do $$ begin
  revoke all on function public.claim_due_enrollments(int) from anon, authenticated;
  grant execute on function public.claim_due_enrollments(int) to service_role;
exception when others then null; end $$;

-- Claim due scheduled status posts (concurrency-safe).
create or replace function public.claim_due_status_posts(max_rows int)
returns setof public.whatsapp_status_posts
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.whatsapp_status_posts s
  set status = 'queued', updated_at = now()
  where s.id in (
    select id from public.whatsapp_status_posts
    where status = 'scheduled'
      and scheduled_at is not null
      and scheduled_at <= now()
    order by scheduled_at
    limit max_rows
    for update skip locked
  )
  returning s.*;
end;
$$;
do $$ begin
  revoke all on function public.claim_due_status_posts(int) from anon, authenticated;
  grant execute on function public.claim_due_status_posts(int) to service_role;
exception when others then null; end $$;

-- Atomic round-robin pick for auto-assignment: returns next user_id for a team
-- ordered by (active_count asc, capacity headroom), respecting presence + capacity.
create or replace function public.whatsapp_pick_assignee(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  picked uuid;
begin
  select user_id into picked
  from public.whatsapp_team_members
  where team_id = p_team_id
    and presence <> 'offline'
    and active_count < capacity
  order by active_count asc, capacity desc
  limit 1;
  if picked is not null then
    update public.whatsapp_team_members
    set active_count = active_count + 1, updated_at = now()
    where team_id = p_team_id and user_id = picked;
  end if;
  return picked;
end;
$$;
do $$ begin
  revoke all on function public.whatsapp_pick_assignee(uuid) from anon, authenticated;
  grant execute on function public.whatsapp_pick_assignee(uuid) to service_role;
exception when others then null; end $$;

commit;
