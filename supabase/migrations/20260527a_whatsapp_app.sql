-- ─────────────────────────────────────────────────────────────────────
-- 20260527a_whatsapp_app.sql — WhatsApp app (Pro-tier feature)
--
-- Tables for a per-workspace WhatsApp gateway integration backed by an
-- external Evolution API (self-hosted Baileys, see the maintainer's clothing-shop
-- project). Every table is workspace-scoped with default-deny RLS that
-- delegates to public.workspace_role_of() — matches the same recipe
-- used by crm_*, tasks, and people in earlier migrations.
--
-- Tables:
--   1. whatsapp_instances        — one Evolution instance per workspace
--   2. whatsapp_messages         — every message in/out (CRM-linked)
--   3. whatsapp_groups           — known groups for the instance
--   4. whatsapp_lists            — saved contact lists for bulk send
--   5. whatsapp_send_jobs        — queued bulk-send jobs (throttled)
--   6. whatsapp_send_log         — per-message log for cooldown / rate
--
-- Idempotency: every statement uses `if not exists` / `do $$ … $$`
-- blocks so re-applying the migration is a no-op.
--
-- Rollback (manual):
--   drop table if exists public.whatsapp_send_log;
--   drop table if exists public.whatsapp_send_jobs;
--   drop table if exists public.whatsapp_lists;
--   drop table if exists public.whatsapp_groups;
--   drop table if exists public.whatsapp_messages;
--   drop table if exists public.whatsapp_instances;
-- ─────────────────────────────────────────────────────────────────────

-- 1. ──────────────── whatsapp_instances ────────────────
create table if not exists public.whatsapp_instances (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces(id) on delete cascade,
  evolution_instance_name text not null unique,
  phone_number            text,
  status                  text not null default 'pending'
                            check (status in ('pending','qr_pending','connected','disconnected','banned','error')),
  qr_code                 text,
  paired_at               timestamptz,
  last_seen_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id) on delete set null
);

create index if not exists whatsapp_instances_ws_idx
  on public.whatsapp_instances(workspace_id);
create index if not exists whatsapp_instances_status_idx
  on public.whatsapp_instances(status);

alter table public.whatsapp_instances enable row level security;

drop policy if exists "wa_inst select for ws members" on public.whatsapp_instances;
create policy "wa_inst select for ws members"
  on public.whatsapp_instances for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_inst insert for ws members" on public.whatsapp_instances;
create policy "wa_inst insert for ws members"
  on public.whatsapp_instances for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_inst update for ws members" on public.whatsapp_instances;
create policy "wa_inst update for ws members"
  on public.whatsapp_instances for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_inst delete for ws owners admins" on public.whatsapp_instances;
create policy "wa_inst delete for ws owners admins"
  on public.whatsapp_instances for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- 2. ──────────────── whatsapp_messages ────────────────
create table if not exists public.whatsapp_messages (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  instance_id           uuid not null references public.whatsapp_instances(id) on delete cascade,
  contact_id            uuid references public.crm_contacts(id) on delete set null,
  direction             text not null check (direction in ('inbound','outbound')),
  from_number           text,
  to_number             text,
  body                  text,
  media_url             text,
  media_type            text,
  status                text not null default 'queued'
                          check (status in ('queued','sent','delivered','read','failed')),
  evolution_message_id  text unique,
  sent_at               timestamptz,
  received_at           timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists whatsapp_messages_ws_contact_created_idx
  on public.whatsapp_messages(workspace_id, contact_id, created_at desc);
create index if not exists whatsapp_messages_instance_created_idx
  on public.whatsapp_messages(instance_id, created_at desc);
create index if not exists whatsapp_messages_evolution_id_idx
  on public.whatsapp_messages(evolution_message_id);

alter table public.whatsapp_messages enable row level security;

drop policy if exists "wa_msg select for ws members" on public.whatsapp_messages;
create policy "wa_msg select for ws members"
  on public.whatsapp_messages for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_msg insert for ws members" on public.whatsapp_messages;
create policy "wa_msg insert for ws members"
  on public.whatsapp_messages for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_msg update for ws members" on public.whatsapp_messages;
create policy "wa_msg update for ws members"
  on public.whatsapp_messages for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_msg delete for ws members" on public.whatsapp_messages;
create policy "wa_msg delete for ws members"
  on public.whatsapp_messages for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

-- 3. ──────────────── whatsapp_groups ────────────────
create table if not exists public.whatsapp_groups (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  instance_id         uuid not null references public.whatsapp_instances(id) on delete cascade,
  evolution_group_id  text not null,
  name                text,
  member_count        int not null default 0,
  members_synced_at   timestamptz,
  created_at          timestamptz not null default now(),
  unique (instance_id, evolution_group_id)
);

create index if not exists whatsapp_groups_ws_idx
  on public.whatsapp_groups(workspace_id);

alter table public.whatsapp_groups enable row level security;

drop policy if exists "wa_grp select for ws members" on public.whatsapp_groups;
create policy "wa_grp select for ws members"
  on public.whatsapp_groups for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_grp insert for ws members" on public.whatsapp_groups;
create policy "wa_grp insert for ws members"
  on public.whatsapp_groups for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_grp update for ws members" on public.whatsapp_groups;
create policy "wa_grp update for ws members"
  on public.whatsapp_groups for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_grp delete for ws members" on public.whatsapp_groups;
create policy "wa_grp delete for ws members"
  on public.whatsapp_groups for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

-- 4. ──────────────── whatsapp_lists ────────────────
create table if not exists public.whatsapp_lists (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  description   text,
  contact_ids   uuid[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

create index if not exists whatsapp_lists_ws_idx
  on public.whatsapp_lists(workspace_id);

alter table public.whatsapp_lists enable row level security;

drop policy if exists "wa_list select for ws members" on public.whatsapp_lists;
create policy "wa_list select for ws members"
  on public.whatsapp_lists for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_list insert for ws members" on public.whatsapp_lists;
create policy "wa_list insert for ws members"
  on public.whatsapp_lists for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_list update for ws members" on public.whatsapp_lists;
create policy "wa_list update for ws members"
  on public.whatsapp_lists for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_list delete for ws members" on public.whatsapp_lists;
create policy "wa_list delete for ws members"
  on public.whatsapp_lists for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

-- 5. ──────────────── whatsapp_send_jobs ────────────────
create table if not exists public.whatsapp_send_jobs (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  instance_id       uuid not null references public.whatsapp_instances(id) on delete cascade,
  target_type       text not null check (target_type in ('contact','group','list')),
  target_id         text not null,
  message_template  text not null,
  template_variants text[] not null default '{}',
  media             jsonb not null default '{}'::jsonb,
  status            text not null default 'queued'
                      check (status in ('queued','running','paused','completed','failed','cancelled')),
  total_contacts    int not null default 0,
  sent_count        int not null default 0,
  failed_count      int not null default 0,
  throttle_config   jsonb not null default '{}'::jsonb,
  error_message     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null
);

create index if not exists whatsapp_send_jobs_ws_idx
  on public.whatsapp_send_jobs(workspace_id);
create index if not exists whatsapp_send_jobs_status_idx
  on public.whatsapp_send_jobs(status, created_at);

alter table public.whatsapp_send_jobs enable row level security;

drop policy if exists "wa_job select for ws members" on public.whatsapp_send_jobs;
create policy "wa_job select for ws members"
  on public.whatsapp_send_jobs for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_job insert for ws members" on public.whatsapp_send_jobs;
create policy "wa_job insert for ws members"
  on public.whatsapp_send_jobs for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_job update for ws members" on public.whatsapp_send_jobs;
create policy "wa_job update for ws members"
  on public.whatsapp_send_jobs for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_job delete for ws members" on public.whatsapp_send_jobs;
create policy "wa_job delete for ws members"
  on public.whatsapp_send_jobs for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

-- 6. ──────────────── whatsapp_send_log ────────────────
create table if not exists public.whatsapp_send_log (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  job_id                uuid references public.whatsapp_send_jobs(id) on delete cascade,
  instance_id           uuid not null references public.whatsapp_instances(id) on delete cascade,
  contact_id            uuid references public.crm_contacts(id) on delete set null,
  to_number             text,
  body                  text,
  status                text not null default 'sent',
  evolution_message_id  text,
  sent_at               timestamptz not null default now()
);

create index if not exists whatsapp_send_log_ws_sent_idx
  on public.whatsapp_send_log(workspace_id, sent_at desc);
create index if not exists whatsapp_send_log_instance_to_idx
  on public.whatsapp_send_log(instance_id, to_number, sent_at desc);

alter table public.whatsapp_send_log enable row level security;

drop policy if exists "wa_log select for ws members" on public.whatsapp_send_log;
create policy "wa_log select for ws members"
  on public.whatsapp_send_log for select
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_log insert for ws members" on public.whatsapp_send_log;
create policy "wa_log insert for ws members"
  on public.whatsapp_send_log for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_log update for ws members" on public.whatsapp_send_log;
create policy "wa_log update for ws members"
  on public.whatsapp_send_log for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

drop policy if exists "wa_log delete for ws members" on public.whatsapp_send_log;
create policy "wa_log delete for ws members"
  on public.whatsapp_send_log for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin','member'));

-- ────────── updated_at trigger for whatsapp_instances/lists ──────────
create or replace function public.whatsapp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists whatsapp_instances_touch on public.whatsapp_instances;
create trigger whatsapp_instances_touch
  before update on public.whatsapp_instances
  for each row execute function public.whatsapp_touch_updated_at();

drop trigger if exists whatsapp_lists_touch on public.whatsapp_lists;
create trigger whatsapp_lists_touch
  before update on public.whatsapp_lists
  for each row execute function public.whatsapp_touch_updated_at();
