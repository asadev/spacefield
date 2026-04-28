-- 2026-04-28 CRM lead-source ingestion: webhook + form + csv (+ stubs for
-- provider connectors landing in Phase 5). Two tables — `crm_lead_sources`
-- describes a configured channel, `crm_lead_source_events` records every
-- inbound payload (accepted, duplicate, rejected, error) for debugging.
--
-- The public ingest endpoints write events through the service-role
-- (bypassing RLS); workspace members read events for the admin UI.

-- ─── crm_lead_sources ───────────────────────────────────────────────────
create table if not exists public.crm_lead_sources (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  -- 'webhook' | 'form' | 'csv' = v1 universal connectors.
  -- Provider-specific kinds are reserved for Phase 5 — schema accepts
  -- them now so the UI/admin can render "Coming soon" cards without a
  -- migration later.
  kind            text not null check (kind in (
    'webhook','form','csv',
    'meta','google','mailchimp','calendly','typeform','tally',
    'linkedin','tiktok','whatsapp','intercom'
  )),
  name            text not null,
  -- URL-safe; the public path slug for forms (`/f/<slug>`) and the
  -- webhook ingest URL (`/api/inbound/webhook/<slug>`).
  slug            text not null,
  -- 32-byte hex secret used to sign webhook bodies and as the optional
  -- `?token=` query fallback for systems that can't sign.
  secret          text not null,
  -- Per-kind config (form fields, csv column mapping, etc.).
  config          jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Lifecycle stats kept on the row so the admin doesn't need to count.
  last_event_at   timestamptz,
  event_count     integer not null default 0,
  unique (workspace_id, slug)
);
create index if not exists crm_lead_sources_ws_kind_idx
  on public.crm_lead_sources(workspace_id, kind);
create index if not exists crm_lead_sources_slug_idx
  on public.crm_lead_sources(slug);

-- ─── crm_lead_source_events ─────────────────────────────────────────────
create table if not exists public.crm_lead_source_events (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.crm_lead_sources(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  -- 'accepted'   — payload turned into a new lead row
  -- 'duplicate'  — matched an existing recent lead, no new row
  -- 'rejected'   — failed signature / bad input / inactive source
  -- 'error'      — internal failure during processing
  status          text not null check (status in ('accepted','rejected','duplicate','error')),
  reason          text,
  -- Raw incoming body for debugging. Caller truncates to ~64KB.
  payload         jsonb not null,
  ip              inet,
  user_agent      text,
  -- The lead created (when accepted) or the existing lead (when duplicate).
  lead_id         uuid references public.crm_leads(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists crm_lead_source_events_source_idx
  on public.crm_lead_source_events(source_id, created_at desc);
create index if not exists crm_lead_source_events_ws_idx
  on public.crm_lead_source_events(workspace_id, created_at desc);

-- ─── triggers ───────────────────────────────────────────────────────────
drop trigger if exists crm_lead_sources_touch on public.crm_lead_sources;
create trigger crm_lead_sources_touch before update on public.crm_lead_sources
  for each row execute function public.crm_touch_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────
-- Sources: workspace members can read their workspace's rows; only
-- owner/admin can write. Public ingestion endpoints use the service-role
-- so they bypass RLS for the read-and-update of `last_event_at`.
alter table public.crm_lead_sources enable row level security;

drop policy if exists "crm_lead_sources select" on public.crm_lead_sources;
create policy "crm_lead_sources select" on public.crm_lead_sources for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "crm_lead_sources insert" on public.crm_lead_sources;
create policy "crm_lead_sources insert" on public.crm_lead_sources for insert
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

drop policy if exists "crm_lead_sources update" on public.crm_lead_sources;
create policy "crm_lead_sources update" on public.crm_lead_sources for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

drop policy if exists "crm_lead_sources delete" on public.crm_lead_sources;
create policy "crm_lead_sources delete" on public.crm_lead_sources for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- Events: members read; INSERT happens via service-role (bypasses RLS);
-- DELETE is owner/admin (cleanup / privacy requests).
alter table public.crm_lead_source_events enable row level security;

drop policy if exists "crm_lead_source_events select" on public.crm_lead_source_events;
create policy "crm_lead_source_events select" on public.crm_lead_source_events for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "crm_lead_source_events delete" on public.crm_lead_source_events;
create policy "crm_lead_source_events delete" on public.crm_lead_source_events for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin'));
